/**
 * File domain service — the Phase 1 vertical slice: create upload session →
 * complete upload → download. Every operation authorises via the policy engine,
 * scopes to the caller's org (RLS + explicit filter, defence in depth), writes
 * an audit event in the SAME transaction, and validates all input with Zod.
 *
 * The web, REST API, and MCP layers all call this service — never the DB directly.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db";
import {
  drives,
  files,
  fileVersions,
  storageObjects,
  storageProviders,
  uploadSessions,
  processingJobs,
  previews,
  extractedText,
  fileVersionMetadata,
} from "@/db/schema";
import { Errors } from "@/lib/errors";
import { newStorageKey } from "@/lib/ids";
import type { AppContext } from "@/lib/context";
import { getStorage } from "@/domains/storage";
import { getQueue } from "@/domains/queue";
import { writeAuditEvent } from "@/domains/audit";
import {
  authorize,
  canDownloadFile,
  canPreviewFile,
  canUploadFile,
  type Obligation,
  type ResourceRef,
} from "@/domains/authorisation";
import { buildFileAttributes } from "./attributes";
import {
  completeUploadSchema,
  createUploadSessionSchema,
  normaliseName,
  type CompleteUploadInput,
  type CreateUploadSessionInput,
} from "./validation";

const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function driveResource(org: string, driveId: string): ResourceRef {
  return { type: "drive", id: driveId, organisationId: org, attributes: {} };
}

/** Look up the org's default storage provider (seeded per tenant). */
async function defaultProvider(tx: Parameters<Parameters<typeof withOrg>[1]>[0], org: string) {
  const [p] = await tx
    .select({ id: storageProviders.id })
    .from(storageProviders)
    .where(and(eq(storageProviders.organisationId, org), eq(storageProviders.isDefault, true)))
    .limit(1);
  if (!p) throw Errors.precondition("No default storage provider configured for this organisation");
  return p;
}

export interface UploadSessionResult {
  uploadSessionId: string;
  objectKey: string;
  upload: { url: string; headers: Record<string, string>; expiresInSeconds: number };
}

export async function createUploadSession(
  ctx: AppContext,
  raw: unknown,
): Promise<UploadSessionResult> {
  const input: CreateUploadSessionInput = createUploadSessionSchema.parse(raw);
  const org = ctx.principal.organisationId;

  // Authorise against the target drive BEFORE doing any work.
  const decision = canUploadFile(ctx.principal, driveResource(org, input.driveId), ctx.request);
  if (!decision.allow) {
    await audit(ctx, "denied", "file.upload", { resourceType: "drive", resourceId: input.driveId, reason: decision.reason });
    throw Errors.denied(decision.reason);
  }

  const objectKey = newStorageKey();

  return withOrg(org, async (tx) => {
    // Verify the drive exists in this tenant (RLS also enforces).
    const [drive] = await tx
      .select({ id: drives.id, dataResidency: drives.dataResidency })
      .from(drives)
      .where(and(eq(drives.id, input.driveId), eq(drives.organisationId, org)))
      .limit(1);
    if (!drive) throw Errors.notFound("Drive not found");
    let baseVersionId: string | null = null;
    if (input.fileId) {
      const [existing] = await tx.select({ id: files.id, driveId: files.driveId, deletedAt: files.deletedAt, currentVersionId: files.currentVersionId }).from(files)
        .where(and(eq(files.id, input.fileId), eq(files.organisationId, org))).limit(1);
      if (!existing || existing.deletedAt || existing.driveId !== input.driveId) throw Errors.notFound("File not found");
      baseVersionId = existing.currentVersionId;
    }

    const [session] = await tx
      .insert(uploadSessions)
      .values({
        organisationId: org,
        driveId: input.driveId,
        folderId: input.folderId ?? null,
        fileId: input.fileId ?? null,
        baseVersionId,
        initiatedBy: ctx.principal.id,
        declaredName: input.name,
        declaredSize: input.sizeBytes,
        declaredMime: input.mimeType,
        status: "initiated",
        checksumSha256: input.checksumSha256 ?? null,
        expiresAt: new Date(Date.now() + UPLOAD_SESSION_TTL_MS),
      })
      .returning({ id: uploadSessions.id });
    if (!session) throw Errors.internal("Failed to create upload session");

    const put = await getStorage().createUploadUrl(objectKey, {
      contentType: input.mimeType,
      ...(input.checksumSha256 ? { checksumSha256: input.checksumSha256 } : {}),
      maxBytes: input.sizeBytes,
    });

    await writeAuditEvent(tx, {
      organisationId: org,
      action: "file.upload.initiated",
      outcome: "success",
      actorType: principalActorType(ctx),
      actorId: ctx.principal.id,
      resourceType: "upload_session",
      resourceId: session.id,
      correlationId: ctx.request.correlationId,
      metadata: { driveId: input.driveId, declaredSize: input.sizeBytes, declaredMime: input.mimeType },
    });

    return {
      uploadSessionId: session.id,
      objectKey,
      upload: { url: put.url, headers: put.headers, expiresInSeconds: put.expiresInSeconds },
    };
  });
}

export interface CompletedFile {
  fileId: string;
  versionId: string;
  status: string;
  processingJobId: string;
}

export async function completeUpload(
  ctx: AppContext,
  raw: unknown,
  objectKey: string,
): Promise<CompletedFile> {
  const input: CompleteUploadInput = completeUploadSchema.parse(raw);
  const org = ctx.principal.organisationId;

  const completed = await withOrg(org, async (tx) => {
    const [session] = await tx
      .select()
      .from(uploadSessions)
      .where(and(eq(uploadSessions.id, input.uploadSessionId), eq(uploadSessions.organisationId, org)))
      .limit(1);
    if (!session) throw Errors.notFound("Upload session not found");
    if (session.initiatedBy !== ctx.principal.id) throw Errors.denied("not_session_initiator");
    if (session.status !== "initiated" && session.status !== "uploading")
      throw Errors.conflict("Upload session is not open");
    if (session.expiresAt.getTime() < Date.now()) throw Errors.precondition("Upload session expired");

    // Verify the object actually landed and matches the declared size.
    const head = await getStorage().headObject(objectKey);
    if (!head) throw Errors.precondition("Uploaded object not found in storage");
    if (head.sizeBytes !== session.declaredSize)
      throw Errors.validation("Uploaded size does not match declared size");
    // If the client declared a checksum at session creation, it must match now.
    if (session.checksumSha256 && session.checksumSha256.toLowerCase() !== input.checksumSha256.toLowerCase())
      throw Errors.validation("Checksum mismatch");

    const provider = await defaultProvider(tx, org);

    const [obj] = await tx
      .insert(storageObjects)
      .values({
        organisationId: org,
        storageProviderId: provider.id,
        objectKey,
        sizeBytes: head.sizeBytes,
        checksumSha256: input.checksumSha256,
        sseMode: "sse-s3",
      })
      .returning({ id: storageObjects.id });
    if (!obj) throw Errors.internal("Failed to record storage object");

    let fileId = session.fileId;
    let versionNumber = 1;
    if (fileId) {
      // Serialise new-version completion for one logical file. This protects the
      // immutable version sequence even when uploads finish concurrently.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${fileId}))`);
      const [existing] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.organisationId, org))).limit(1);
      if (!existing || existing.deletedAt) throw Errors.notFound("File not found");
      if (existing.currentVersionId !== session.baseVersionId) throw Errors.conflict("A newer file version was completed first; start a new upload session");
      const [latest] = await tx.select({ versionNumber: fileVersions.versionNumber }).from(fileVersions)
        .where(eq(fileVersions.fileId, fileId)).orderBy(desc(fileVersions.versionNumber)).limit(1);
      versionNumber = (latest?.versionNumber ?? 0) + 1;
      await tx.update(fileVersions).set({ isCurrent: false }).where(eq(fileVersions.fileId, fileId));
      await tx.update(files).set({
        name: session.declaredName, normalisedName: normaliseName(session.declaredName), mimeType: session.declaredMime,
        sizeBytes: head.sizeBytes, status: "quarantined", malwareStatus: "pending", processingStatus: "pending",
      }).where(eq(files.id, fileId));
    } else {
      const [file] = await tx.insert(files).values({
        organisationId: org, driveId: session.driveId, folderId: session.folderId, name: session.declaredName,
        normalisedName: normaliseName(session.declaredName), mimeType: session.declaredMime, sizeBytes: head.sizeBytes,
        ownerId: ctx.principal.id, status: "quarantined", malwareStatus: "pending", processingStatus: "pending",
        dataResidency: await residencyFor(tx, session.driveId, org),
      }).returning({ id: files.id });
      if (!file) throw Errors.internal("Failed to create file");
      fileId = file.id;
    }

    const [version] = await tx
      .insert(fileVersions)
      .values({
        organisationId: org,
        fileId,
        versionNumber,
        storageObjectId: obj.id,
        sizeBytes: head.sizeBytes,
        checksumSha256: input.checksumSha256,
        mimeType: session.declaredMime,
        createdBy: ctx.principal.id,
        isCurrent: true,
      })
      .returning({ id: fileVersions.id });
    if (!version) throw Errors.internal("Failed to create file version");

    await tx.update(files).set({ currentVersionId: version.id }).where(eq(files.id, fileId));
    await tx.update(uploadSessions).set({ status: "completed", storageObjectId: obj.id }).where(eq(uploadSessions.id, session.id));

    const [job] = await tx.insert(processingJobs).values({ organisationId: org, type: "malware.scan", status: "queued",
      resourceType: "file_version", resourceId: version.id, correlationId: ctx.request.correlationId,
      payload: { fileId, versionId: version.id, objectKey } }).returning({ id: processingJobs.id });
    if (!job) throw Errors.internal("Failed to create durable scan job");

    await writeAuditEvent(tx, {
      organisationId: org,
      action: "file.uploaded",
      outcome: "success",
      actorType: principalActorType(ctx),
      actorId: ctx.principal.id,
      resourceType: "file",
      resourceId: fileId,
      resourceVersion: String(versionNumber),
      correlationId: ctx.request.correlationId,
      metadata: { sizeBytes: head.sizeBytes, checksum: input.checksumSha256 },
    });

    return { fileId, versionId: version.id, status: "quarantined", processingJobId: job.id };
  });
  // Queue IO happens after the database transaction commits. If dispatch fails,
  // the file remains quarantined and therefore unavailable rather than exposed.
  await getQueue().enqueue({ type: "malware.scan", organisationId: org, correlationId: ctx.request.correlationId,
    payload: { fileId: completed.fileId, versionId: completed.versionId, objectKey, processingJobId: completed.processingJobId },
  }, { idempotencyKey: `scan-${completed.versionId}` });
  return completed;
}

export interface DownloadResult {
  url: string;
  expiresInSeconds: number;
  obligations: Obligation[];
}

export interface FileDetail {
  id: string; name: string; mimeType: string; sizeBytes: number; status: string;
  malwareStatus: string; processingStatus: string; dataResidency: string;
  sourceSystem: string | null; updatedAt: Date;
  preview: { status: string; error: string | null; available: boolean } | null;
  metadata: Record<string, unknown> | null;
  versions: Array<{ id: string; versionNumber: number; sizeBytes: number; createdAt: Date; comment: string | null; isCurrent: boolean }>;
}

export async function getFileDetail(ctx: AppContext, fileId: string): Promise<FileDetail> {
  const org = ctx.principal.organisationId;
  return withOrg(org, async (tx) => {
    const [file] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.organisationId, org))).limit(1);
    if (!file || file.deletedAt) throw Errors.notFound("File not found");
    const attributes = await buildFileAttributes(tx, { id: file.id, driveId: file.driveId, folderId: file.folderId, ownerId: file.ownerId, dataResidency: file.dataResidency });
    const decision = authorize(ctx.principal, "file.read", { type: "file", id: file.id, organisationId: org, attributes }, ctx.request);
    if (!decision.allow) throw Errors.denied(decision.reason);
    const versions = await tx.select({ id: fileVersions.id, versionNumber: fileVersions.versionNumber, sizeBytes: fileVersions.sizeBytes, createdAt: fileVersions.createdAt, comment: fileVersions.comment, isCurrent: fileVersions.isCurrent }).from(fileVersions).where(eq(fileVersions.fileId, file.id)).orderBy(desc(fileVersions.versionNumber));
    const [preview] = file.currentVersionId ? await tx.select({ status: previews.status, error: previews.error }).from(previews)
      .where(and(eq(previews.fileVersionId, file.currentVersionId), eq(previews.kind, "text"))).limit(1) : [];
    const [metadata] = file.currentVersionId ? await tx.select({ values: fileVersionMetadata.values }).from(fileVersionMetadata)
      .where(eq(fileVersionMetadata.fileVersionId, file.currentVersionId)).limit(1) : [];
    return { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, status: file.status,
      malwareStatus: file.malwareStatus, processingStatus: file.processingStatus, dataResidency: file.dataResidency,
      sourceSystem: file.sourceSystem, updatedAt: file.updatedAt, versions,
      preview: preview ? { ...preview, available: preview.status === "completed" } : null,
      metadata: (metadata?.values ?? null) as Record<string, unknown> | null };
  });
}

export interface FilePreviewResult { content: string; mimeType: string; versionId: string; dataResidency: string; watermark: string | null }

export async function getFilePreview(ctx: AppContext, fileId: string): Promise<FilePreviewResult> {
  const org = ctx.principal.organisationId;
  return withOrg(org, async (tx) => {
    const [file] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.organisationId, org))).limit(1);
    if (!file || file.deletedAt) throw Errors.notFound("File not found");
    if (file.status !== "available" || file.malwareStatus !== "clean" || file.processingStatus !== "completed" || !file.currentVersionId)
      throw Errors.precondition("Preview is not ready");
    const attributes = await buildFileAttributes(tx, { id: file.id, driveId: file.driveId, folderId: file.folderId,
      ownerId: file.ownerId, dataResidency: file.dataResidency });
    const decision = canPreviewFile(ctx.principal, { type: "file", id: file.id, organisationId: org, attributes }, ctx.request);
    if (!decision.allow) {
      await writeAuditEvent(tx, { organisationId: org, action: "file.preview", outcome: "denied", actorType: principalActorType(ctx),
        actorId: ctx.principal.id, resourceType: "file", resourceId: file.id, failureReason: decision.reason,
        correlationId: ctx.request.correlationId });
      throw Errors.denied(decision.reason);
    }
    const [preview] = await tx.select({ status: previews.status, error: previews.error }).from(previews)
      .where(and(eq(previews.fileVersionId, file.currentVersionId), eq(previews.kind, "text"))).limit(1);
    if (!preview || preview.status !== "completed") throw Errors.precondition(preview?.error ?? "Preview is unavailable");
    const [text] = await tx.select({ content: extractedText.content }).from(extractedText)
      .where(eq(extractedText.fileVersionId, file.currentVersionId)).limit(1);
    if (!text) throw Errors.precondition("Preview content is unavailable");
    const watermarked = decision.obligations.some((item) => item.kind === "watermark");
    await writeAuditEvent(tx, { organisationId: org, action: "file.preview", outcome: "success", actorType: principalActorType(ctx),
      actorId: ctx.principal.id, resourceType: "file", resourceId: file.id, resourceVersion: file.currentVersionId,
      correlationId: ctx.request.correlationId, metadata: { obligations: decision.obligations.map((item) => item.kind), dataResidency: file.dataResidency } });
    return { content: text.content, mimeType: file.mimeType, versionId: file.currentVersionId, dataResidency: file.dataResidency,
      watermark: watermarked ? `Protected preview · ${ctx.principal.id.slice(0, 8)} · ${new Date().toISOString()}` : null };
  });
}

export async function getDownloadUrl(ctx: AppContext, fileId: string): Promise<DownloadResult> {
  const org = ctx.principal.organisationId;

  return withOrg(org, async (tx) => {
    const [file] = await tx
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.organisationId, org)))
      .limit(1);
    // Hide existence from unauthorised callers: not found and denied look the same.
    if (!file || file.deletedAt) throw Errors.notFound("File not found");

    // A file that has not cleared malware scanning is never downloadable.
    if (file.status !== "available") {
      if (file.malwareStatus === "infected") throw Errors.malware();
      throw Errors.precondition(`File is not available (status: ${file.status})`);
    }
    if (!file.currentVersionId) throw Errors.precondition("File has no current version");

    const attributes = await buildFileAttributes(tx, {
      id: file.id,
      driveId: file.driveId,
      folderId: file.folderId,
      ownerId: file.ownerId,
      dataResidency: file.dataResidency,
    });
    const resource: ResourceRef = { type: "file", id: file.id, organisationId: org, attributes };

    const decision = canDownloadFile(ctx.principal, resource, ctx.request);
    if (!decision.allow) {
      await writeAuditEvent(tx, {
        organisationId: org,
        action: "file.download",
        outcome: "denied",
        actorType: principalActorType(ctx),
        actorId: ctx.principal.id,
        resourceType: "file",
        resourceId: file.id,
        failureReason: decision.reason,
        correlationId: ctx.request.correlationId,
      });
      throw Errors.denied(decision.reason);
    }

    const [version] = await tx
      .select({ storageObjectId: fileVersions.storageObjectId, versionNumber: fileVersions.versionNumber })
      .from(fileVersions)
      .where(eq(fileVersions.id, file.currentVersionId))
      .limit(1);
    if (!version) throw Errors.internal("Current version missing");
    const [obj] = await tx
      .select({ objectKey: storageObjects.objectKey })
      .from(storageObjects)
      .where(eq(storageObjects.id, version.storageObjectId))
      .limit(1);
    if (!obj) throw Errors.internal("Storage object missing");

    const signed = await getStorage().getSignedDownloadUrl(obj.objectKey, {
      disposition: "attachment",
      filename: file.name,
      contentType: file.mimeType,
    });

    await tx.update(files).set({ lastAccessedAt: new Date() }).where(eq(files.id, file.id));
    await writeAuditEvent(tx, {
      organisationId: org,
      action: "file.download",
      outcome: "success",
      actorType: principalActorType(ctx),
      actorId: ctx.principal.id,
      resourceType: "file",
      resourceId: file.id,
      resourceVersion: String(version.versionNumber),
      correlationId: ctx.request.correlationId,
      metadata: { obligations: decision.obligations.map((o) => o.kind) },
    });

    return { url: signed.url, expiresInSeconds: signed.expiresInSeconds, obligations: decision.obligations };
  });
}

// --- helpers ---

async function residencyFor(
  tx: Parameters<Parameters<typeof withOrg>[1]>[0],
  driveId: string,
  org: string,
): Promise<string> {
  const [d] = await tx
    .select({ dataResidency: drives.dataResidency })
    .from(drives)
    .where(and(eq(drives.id, driveId), eq(drives.organisationId, org)))
    .limit(1);
  return d?.dataResidency ?? org;
}

function principalActorType(ctx: AppContext): "user" | "service_account" | "api_client" | "agent" | "system" {
  const t = ctx.principal.type;
  return t === "external_user" ? "user" : t;
}

async function audit(
  ctx: AppContext,
  outcome: "success" | "failure" | "denied" | "error",
  action: string,
  opts: { resourceType?: string; resourceId?: string; reason?: string },
): Promise<void> {
  await withOrg(ctx.principal.organisationId, async (tx) => {
    await writeAuditEvent(tx, {
      organisationId: ctx.principal.organisationId,
      action,
      outcome,
      actorType: principalActorType(ctx),
      actorId: ctx.principal.id,
      ...(opts.resourceType ? { resourceType: opts.resourceType } : {}),
      ...(opts.resourceId ? { resourceId: opts.resourceId } : {}),
      ...(opts.reason ? { failureReason: opts.reason } : {}),
      correlationId: ctx.request.correlationId,
    });
  });
}
