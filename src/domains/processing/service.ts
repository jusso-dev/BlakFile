import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db";
import { files, processingJobs } from "@/db/schema";
import { writeAuditEvent } from "@/domains/audit";

export type ContentJobPayload = { fileId: string; versionId: string; processingJobId: string };

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
  await withOrg(organisationId, async (tx) => {
    const [file] = await tx.select({ currentVersionId: files.currentVersionId, malwareStatus: files.malwareStatus }).from(files)
      .where(and(eq(files.id, payload.fileId), eq(files.organisationId, organisationId))).limit(1);
    if (!file || file.currentVersionId !== payload.versionId) return;
    if (file.malwareStatus !== "clean") throw new Error("content processing blocked until clean malware verdict");
    await tx.update(files).set({ status: "available", processingStatus: "completed" })
      .where(and(eq(files.id, payload.fileId), eq(files.organisationId, organisationId)));
    await writeAuditEvent(tx, { organisationId, action: "file.processing.completed", outcome: "success", actorType: "system",
      resourceType: "file", resourceId: payload.fileId, resourceVersion: payload.versionId, correlationId });
  });
}
