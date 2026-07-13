import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db";
import { extractedText, files, fileVersionMetadata, fileVersions, previews, processingJobs, storageObjects } from "@/db/schema";
import { writeAuditEvent } from "@/domains/audit";
import { getStorage } from "@/domains/storage";

export type ContentJobPayload = { fileId: string; versionId: string; processingJobId: string };
const MAX_EXTRACT_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACT_CHARS = 200_000;
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "application/xml", "text/xml"]);

async function readLimited(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > maxBytes) throw new Error("preview_size_limit"); chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export async function markProcessingJobActive(organisationId: string, jobId: string): Promise<void> {
  await withOrg(organisationId, async (tx) => { await tx.update(processingJobs).set({ status: "active", startedAt: new Date(),
    attempts: sql`${processingJobs.attempts} + 1`, error: null }).where(and(eq(processingJobs.id, jobId), eq(processingJobs.organisationId, organisationId))); });
}

export async function markProcessingJobCompleted(organisationId: string, jobId: string): Promise<void> {
  await withOrg(organisationId, async (tx) => { await tx.update(processingJobs).set({ status: "completed", completedAt: new Date() })
    .where(and(eq(processingJobs.id, jobId), eq(processingJobs.organisationId, organisationId))); });
}

export async function markProcessingJobFailed(organisationId: string, jobId: string, error: unknown): Promise<void> {
  await withOrg(organisationId, async (tx) => { await tx.update(processingJobs).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : "job_failed" })
    .where(and(eq(processingJobs.id, jobId), eq(processingJobs.organisationId, organisationId))); });
}

export async function runTrackedProcessingJob(organisationId: string, jobId: string | undefined, handler: () => Promise<void>): Promise<void> {
  if (jobId) await markProcessingJobActive(organisationId, jobId);
  try {
    await handler();
    if (jobId) await markProcessingJobCompleted(organisationId, jobId);
  } catch (error) {
    if (jobId) await markProcessingJobFailed(organisationId, jobId, error);
    throw error;
  }
}

export async function runContentProcessing(organisationId: string, correlationId: string, payload: ContentJobPayload): Promise<void> {
  const source = await withOrg(organisationId, async (tx) => {
    const [file] = await tx.select({ currentVersionId: files.currentVersionId, malwareStatus: files.malwareStatus, mimeType: files.mimeType,
      sizeBytes: files.sizeBytes, processingStatus: files.processingStatus }).from(files)
      .where(and(eq(files.id, payload.fileId), eq(files.organisationId, organisationId))).limit(1);
    if (!file || file.currentVersionId !== payload.versionId) return null;
    if (file.malwareStatus !== "clean") throw new Error("content processing blocked until clean malware verdict");
    const [existingPreview] = await tx.select({ status: previews.status }).from(previews)
      .where(and(eq(previews.fileVersionId, payload.versionId), eq(previews.kind, "text"))).limit(1);
    if (file.processingStatus === "completed" && existingPreview) return null;
    const [version] = await tx.select({ checksumSha256: fileVersions.checksumSha256, mimeType: fileVersions.mimeType,
      storageObjectId: fileVersions.storageObjectId }).from(fileVersions).where(eq(fileVersions.id, payload.versionId)).limit(1);
    if (!version) throw new Error("file_version_missing");
    const [object] = await tx.select({ objectKey: storageObjects.objectKey }).from(storageObjects).where(eq(storageObjects.id, version.storageObjectId)).limit(1);
    if (!object) throw new Error("storage_object_missing");
    return { ...file, ...version, objectKey: object.objectKey };
  });
  if (!source) return;

  let content: string | null = null; let previewError: string | null = null;
  if (!TEXT_TYPES.has(source.mimeType)) previewError = "unsupported_media_type";
  else if (source.sizeBytes > MAX_EXTRACT_BYTES) previewError = "preview_size_limit";
  else {
    try {
      const bytes = await readLimited(await getStorage().getObjectStream(source.objectKey), MAX_EXTRACT_BYTES);
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, MAX_EXTRACT_CHARS);
      if (source.mimeType === "application/json") JSON.parse(content);
    } catch (error) { previewError = error instanceof Error && error.message === "preview_size_limit" ? error.message : "content_decode_failed"; }
  }
  await withOrg(organisationId, async (tx) => {
    const [file] = await tx.select({ currentVersionId: files.currentVersionId, malwareStatus: files.malwareStatus }).from(files)
      .where(and(eq(files.id, payload.fileId), eq(files.organisationId, organisationId))).limit(1);
    if (!file || file.currentVersionId !== payload.versionId || file.malwareStatus !== "clean") return;
    const values = { mimeType: source.mimeType, sizeBytes: source.sizeBytes, checksumSha256: source.checksumSha256,
      extractedChars: content?.length ?? 0, extractionLimitBytes: MAX_EXTRACT_BYTES, extractionLimitChars: MAX_EXTRACT_CHARS };
    await tx.insert(fileVersionMetadata).values({ organisationId, fileVersionId: payload.versionId, extractor: "blakfile-text-v1", values })
      .onConflictDoUpdate({ target: fileVersionMetadata.fileVersionId, set: { extractor: "blakfile-text-v1", values } });
    await tx.insert(previews).values({ organisationId, fileVersionId: payload.versionId, kind: "text",
      status: previewError ? "failed" : "completed", error: previewError })
      .onConflictDoUpdate({ target: [previews.fileVersionId, previews.kind], set: { status: previewError ? "failed" : "completed", error: previewError } });
    if (content !== null) await tx.insert(extractedText).values({ organisationId, fileVersionId: payload.versionId,
      source: "parser", language: "und", charCount: content.length, content })
      .onConflictDoUpdate({ target: extractedText.fileVersionId, set: { charCount: content.length, content } });
    await tx.update(files).set({ status: "available", processingStatus: "completed" })
      .where(and(eq(files.id, payload.fileId), eq(files.organisationId, organisationId)));
    await writeAuditEvent(tx, { organisationId, action: "file.processing.completed", outcome: "success", actorType: "system",
      resourceType: "file", resourceId: payload.fileId, resourceVersion: payload.versionId, correlationId,
      metadata: { previewStatus: previewError ? "failed" : "completed", failureReason: previewError, extractedChars: content?.length ?? 0 } });
  });
}
