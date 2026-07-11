/**
 * Drive + folder navigation service. Same authorisation/audit discipline as the
 * file service: every read/create authorises via the policy engine and scopes to
 * the caller's org (RLS + explicit filter).
 */
import { and, eq, isNull } from "drizzle-orm";
import { withOrg } from "@/db";
import { drives, files, folders } from "@/db/schema";
import { Errors } from "@/lib/errors";
import type { AppContext } from "@/lib/context";
import { writeAuditEvent } from "@/domains/audit";
import { authorize, type ResourceRef } from "@/domains/authorisation";
import { childPath, createFolderSchema, listContentsSchema } from "./validation";

function orgResource(org: string): ResourceRef {
  return { type: "organisation", id: org, organisationId: org, attributes: {} };
}
function driveResource(org: string, driveId: string): ResourceRef {
  return { type: "drive", id: driveId, organisationId: org, attributes: {} };
}

export interface DriveDto {
  id: string;
  name: string;
  type: string;
  usedBytes: number;
  quotaBytes: number | null;
  dataResidency: string;
}

export async function listDrives(ctx: AppContext): Promise<DriveDto[]> {
  const org = ctx.principal.organisationId;
  const decision = authorize(ctx.principal, "file.read", orgResource(org), ctx.request);
  if (!decision.allow) throw Errors.denied(decision.reason);

  return withOrg(org, (tx) =>
    tx
      .select({
        id: drives.id,
        name: drives.name,
        type: drives.type,
        usedBytes: drives.usedBytes,
        quotaBytes: drives.quotaBytes,
        dataResidency: drives.dataResidency,
      })
      .from(drives)
      .where(eq(drives.organisationId, org)),
  );
}

export interface FolderDto {
  id: string;
  name: string;
  path: string;
  depth: number;
}

export async function createFolder(ctx: AppContext, raw: unknown): Promise<FolderDto> {
  const input = createFolderSchema.parse(raw);
  const org = ctx.principal.organisationId;

  // Creating a folder is a write to the drive — gate on upload permission.
  const decision = authorize(ctx.principal, "file.upload", driveResource(org, input.driveId), ctx.request);
  if (!decision.allow) throw Errors.denied(decision.reason);

  return withOrg(org, async (tx) => {
    const [drive] = await tx
      .select({ id: drives.id })
      .from(drives)
      .where(and(eq(drives.id, input.driveId), eq(drives.organisationId, org)))
      .limit(1);
    if (!drive) throw Errors.notFound("Drive not found");

    let parentPath: string | null = null;
    let depth = 1;
    if (input.parentFolderId) {
      const [parent] = await tx
        .select({ path: folders.path, depth: folders.depth, driveId: folders.driveId })
        .from(folders)
        .where(and(eq(folders.id, input.parentFolderId), eq(folders.organisationId, org)))
        .limit(1);
      if (!parent || parent.driveId !== input.driveId) throw Errors.notFound("Parent folder not found");
      parentPath = parent.path;
      depth = parent.depth + 1;
    }

    const path = childPath(parentPath, input.name);
    const [created] = await tx
      .insert(folders)
      .values({
        organisationId: org,
        driveId: input.driveId,
        parentFolderId: input.parentFolderId ?? null,
        name: input.name,
        path,
        depth,
        createdBy: ctx.principal.id,
      })
      .returning({ id: folders.id, name: folders.name, path: folders.path, depth: folders.depth });
    if (!created) throw Errors.internal("Failed to create folder");

    await writeAuditEvent(tx, {
      organisationId: org,
      action: "folder.created",
      outcome: "success",
      actorType: ctx.principal.type === "external_user" ? "user" : ctx.principal.type,
      actorId: ctx.principal.id,
      resourceType: "folder",
      resourceId: created.id,
      correlationId: ctx.request.correlationId,
      metadata: { driveId: input.driveId, path },
    });

    return created;
  });
}

export interface FolderContents {
  folders: FolderDto[];
  files: Array<{ id: string; name: string; mimeType: string; sizeBytes: number; status: string }>;
}

export async function listFolderContents(ctx: AppContext, raw: unknown): Promise<FolderContents> {
  const input = listContentsSchema.parse(raw);
  const org = ctx.principal.organisationId;
  const decision = authorize(ctx.principal, "file.read", driveResource(org, input.driveId), ctx.request);
  if (!decision.allow) throw Errors.denied(decision.reason);

  const folderId = input.folderId ?? null;

  return withOrg(org, async (tx) => {
    const subfolders = await tx
      .select({ id: folders.id, name: folders.name, path: folders.path, depth: folders.depth })
      .from(folders)
      .where(
        and(
          eq(folders.organisationId, org),
          eq(folders.driveId, input.driveId),
          folderId ? eq(folders.parentFolderId, folderId) : isNull(folders.parentFolderId),
        ),
      );

    const fileRows = await tx
      .select({
        id: files.id,
        name: files.name,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        status: files.status,
      })
      .from(files)
      .where(
        and(
          eq(files.organisationId, org),
          eq(files.driveId, input.driveId),
          folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
          isNull(files.deletedAt),
        ),
      );

    return { folders: subfolders, files: fileRows };
  });
}
