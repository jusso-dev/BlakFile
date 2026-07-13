import { and, eq, sql } from "drizzle-orm";
import { authDb, withOrg } from "@/db";
import { files, fileVersions, shareAccessEvents, shareLinks, shares, storageObjects } from "@/db/schema";
import { writeAuditEvent } from "@/domains/audit";
import { getStorage } from "@/domains/storage";
import { auth } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { newCorrelationId } from "@/lib/ids";

type LinkLookup = {
  id: string; organisationId: string; shareId: string; fileId: string | null;
  requireAuth: boolean; downloadEnabled: boolean; accessCount: number; maxAccessCount: number | null;
  linkExpiresAt: Date | null; linkRevokedAt: Date | null; shareExpiresAt: Date | null; shareRevokedAt: Date | null;
};

export type ShareLinkAccess = {
  authenticationRequired: boolean;
  file?: { id: string; name: string; mimeType: string; sizeBytes: number; status: string; dataResidency: string };
  downloadEnabled?: boolean;
};

function active(link: LinkLookup): boolean {
  const now = Date.now();
  return !link.linkRevokedAt && !link.shareRevokedAt
    && (!link.linkExpiresAt || link.linkExpiresAt.getTime() > now)
    && (!link.shareExpiresAt || link.shareExpiresAt.getTime() > now)
    && (link.maxAccessCount === null || link.accessCount < link.maxAccessCount);
}

/**
 * The opaque link is the one controlled entry point that begins before a tenant
 * is known. Resolve only its tenant identifier with the bootstrap connection;
 * all resource and event queries below execute inside the recovered tenant RLS
 * scope. Tokens are never returned or written to audit metadata.
 */
async function findActiveLink(token: string): Promise<LinkLookup> {
  const [link] = await authDb
    .select({
      id: shareLinks.id, organisationId: shareLinks.organisationId, shareId: shareLinks.shareId,
      fileId: shares.fileId, requireAuth: shareLinks.requireAuth, downloadEnabled: shareLinks.downloadEnabled,
      accessCount: shareLinks.accessCount, maxAccessCount: shareLinks.maxAccessCount,
      linkExpiresAt: shareLinks.expiresAt, linkRevokedAt: shareLinks.revokedAt,
      shareExpiresAt: shares.expiresAt, shareRevokedAt: shares.revokedAt,
    })
    .from(shareLinks)
    .innerJoin(shares, eq(shares.id, shareLinks.shareId))
    .where(eq(shareLinks.token, token))
    .limit(1);
  if (!link || !link.fileId || !active(link)) throw Errors.notFound("Share link unavailable");
  return link;
}

async function sessionFor(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ? session : null;
}

function requestMeta(headers: Headers) {
  return {
    correlationId: headers.get("x-correlation-id") ?? newCorrelationId(),
    ipAddress: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: headers.get("user-agent") ?? undefined,
  };
}

async function recordAccess(
  link: LinkLookup,
  action: "viewed" | "downloaded",
  session: Awaited<ReturnType<typeof sessionFor>>,
  headers: Headers,
  fileVersionId?: string,
): Promise<void> {
  const meta = requestMeta(headers);
  await withOrg(link.organisationId, async (tx) => {
    await tx.insert(shareAccessEvents).values({
      organisationId: link.organisationId, shareLinkId: link.id, shareId: link.shareId,
      recipientEmail: session?.user.email ?? null, ipAddress: meta.ipAddress, userAgent: meta.userAgent,
      action, fileVersionId: fileVersionId ?? null,
    });
    await tx.update(shareLinks).set({ accessCount: sql`${shareLinks.accessCount} + 1` }).where(eq(shareLinks.id, link.id));
    await writeAuditEvent(tx, {
      organisationId: link.organisationId, action: `share_link.${action}`, outcome: "success",
      actorType: session ? "user" : "anonymous",
      ...(session ? { actorId: session.user.id } : {}),
      resourceType: "file", ...(link.fileId ? { resourceId: link.fileId } : {}),
      ...(fileVersionId ? { resourceVersion: fileVersionId } : {}),
      correlationId: meta.correlationId,
      ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
      metadata: { shareId: link.shareId, shareLinkId: link.id, authenticated: Boolean(session) },
    });
  });
}

export async function getShareLinkAccess(token: string, headers: Headers): Promise<ShareLinkAccess> {
  const link = await findActiveLink(token);
  const session = await sessionFor(headers);
  if (link.requireAuth && !session) return { authenticationRequired: true };

  const file = await withOrg(link.organisationId, async (tx) => {
    const [record] = await tx.select({
      id: files.id, name: files.name, mimeType: files.mimeType, sizeBytes: files.sizeBytes,
      status: files.status, dataResidency: files.dataResidency, deletedAt: files.deletedAt,
    }).from(files).where(and(eq(files.id, link.fileId!), eq(files.organisationId, link.organisationId))).limit(1);
    if (!record || record.deletedAt) throw Errors.notFound("Share link unavailable");
    return record;
  });
  await recordAccess(link, "viewed", session, headers);
  return { authenticationRequired: false, file, downloadEnabled: link.downloadEnabled && file.status === "available" };
}

export async function getShareLinkDownload(token: string, headers: Headers): Promise<{ url: string; expiresInSeconds: number }> {
  const link = await findActiveLink(token);
  const session = await sessionFor(headers);
  if (link.requireAuth && !session) throw Errors.unauthenticated();
  if (!link.downloadEnabled) throw Errors.denied("share_link_download_disabled");

  const result = await withOrg(link.organisationId, async (tx) => {
    const [file] = await tx.select().from(files).where(and(eq(files.id, link.fileId!), eq(files.organisationId, link.organisationId))).limit(1);
    if (!file || file.deletedAt) throw Errors.notFound("Share link unavailable");
    if (file.status !== "available" || file.malwareStatus !== "clean" || !file.currentVersionId) throw Errors.precondition("File is not available for download");
    const [version] = await tx.select({ id: fileVersions.id, storageObjectId: fileVersions.storageObjectId }).from(fileVersions).where(eq(fileVersions.id, file.currentVersionId)).limit(1);
    if (!version) throw Errors.internal("Current version missing");
    const [object] = await tx.select({ objectKey: storageObjects.objectKey }).from(storageObjects).where(eq(storageObjects.id, version.storageObjectId)).limit(1);
    if (!object) throw Errors.internal("Storage object missing");
    const signed = await getStorage().getSignedDownloadUrl(object.objectKey, { disposition: "attachment", filename: file.name, contentType: file.mimeType });
    await tx.update(files).set({ lastAccessedAt: new Date() }).where(eq(files.id, file.id));
    return { signed, versionId: version.id };
  });
  await recordAccess(link, "downloaded", session, headers, result.versionId);
  return { url: result.signed.url, expiresInSeconds: result.signed.expiresInSeconds };
}
