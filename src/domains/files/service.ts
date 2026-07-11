/**
 * File domain service — the Phase 1 vertical slice: create upload session →
 * complete upload → download. Every operation authorises via the policy engine,
 * scopes to the caller's org (RLS + explicit filter, defence in depth), writes
 * an audit event in the SAME transaction, and validates all input with Zod.
 *
 * The web, REST API, and MCP layers all call this service — never the DB directly.
 */
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/db";
import {
  drives,
  files,
  fileVersions,
  storageObjects,
  storageProviders,
  uploadSessions,
} from "@/db/schema";
import { Errors } from "@/lib/errors";
import { newStorageKey } from "@/lib/ids";
import type { AppContext } from "@/lib/context";
import { getStorage } from "@/domains/storage";
import { getQueue } from "@/domains/queue";
import { writeAuditEvent } from "@/domains/audit";
import {
  canDownloadFile,
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

    const [session] = await tx
      .insert(uploadSessions)
      .values({
        organisationId: org,
        driveId: input.driveId,
        folderId: input.folderId ?? null,
        fileId: input.fileId ?? null,
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
}

export async function completeUpload(
  ctx: AppContext,
  raw: unknown,
  objectKey: string,
): Promise<CompletedFile> {
  const input: CompleteUploadInput = completeUploadSchema.parse(raw);
  const org = ctx.principal.organisationId;

  return withOrg(org, async (tx) => {
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

    // Create the file (quarantined until malware scan clears) + its first version.
    const [file] = await tx
      .insert(files)
      .values({
        organisationId: org,
        driveId: session.driveId,
        folderId: session.folderId,
        name: session.declaredName,
        normalisedName: normaliseName(session.declaredName),
        mimeType: session.declaredMime,
        sizeBytes: head.sizeBytes,
        ownerId: ctx.principal.id,
        status: "quarantined",
        malwareStatus: "pending",
        processingStatus: "pending",
        dataResidency: await residencyFor(tx, session.driveId, org),
      })
      .returning({ id: files.id });
    if (!file) throw Errors.internal("Failed to create file");

    const [version] = await tx
      .insert(fileVersions)
      .values({
        organisationId: org,
        fileId: file.id,
        versionNumber: 1,
        storageObjectId: obj.id,
        sizeBytes: head.sizeBytes,
        checksumSha256: input.checksumSha256,
        mimeType: session.declaredMime,
        createdBy: ctx.principal.id,
        isCurrent: true,
      })
      .returning({ id: fileVersions.id });
    if (!version) throw Errors.internal("Failed to create file version");

    await tx.update(files).set({ currentVersionId: version.id }).where(eq(files.id, file.id));
    await tx.update(uploadSessions).set({ status: "completed", storageObjectId: obj.id }).where(eq(uploadSessions.id, session.id));

    await writeAuditEvent(tx, {
      organisationId: org,
      action: "file.uploaded",
      outcome: "success",
      actorType: principalActorType(ctx),
      actorId: ctx.principal.id,
      resourceType: "file",
      resourceId: file.id,
      resourceVersion: "1",
      correlationId: ctx.request.correlationId,
      metadata: { sizeBytes: head.sizeBytes, checksum: input.checksumSha256 },
    });

    // Kick off the async security pipeline. File stays quarantined until it clears.
    await getQueue().enqueue({
      type: "malware.scan",
      organisationId: org,
      correlationId: ctx.request.correlationId,
      payload: { fileId: file.id, versionId: version.id, objectKey },
    }, { idempotencyKey: `scan-${version.id}` });

    return { fileId: file.id, versionId: version.id, status: "quarantined" };
  });
}

export interface DownloadResult {
  url: string;
  expiresInSeconds: number;
  obligations: Obligation[];
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
