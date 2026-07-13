import { and, eq, sql } from "drizzle-orm";
import { isIP } from "node:net";
import { authDb, withOrg, type DbTx } from "@/db";
import { files, fileVersions, securityEvents, shareAccessEvents, shareLinks, shares, storageObjects } from "@/db/schema";
import { writeAuditEvent } from "@/domains/audit";
import { getStorage } from "@/domains/storage";
import { auth } from "@/lib/auth";
import { verifySecret } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { newCorrelationId } from "@/lib/ids";
import { enforceShareRateLimit, recordInvalidShareLookup, takeInvalidShareLookupCount } from "./rate-limit";

type LinkLookup = {
  id: string; organisationId: string; shareId: string; fileId: string | null;
  requireAuth: boolean; passwordHash: string | null; downloadEnabled: boolean;
  allowedDomains: unknown; allowedIpRanges: unknown; allowedCountries: unknown;
  accessCount: number; maxAccessCount: number | null; oneTime: boolean; consumedAt: Date | null;
  linkExpiresAt: Date | null; linkRevokedAt: Date | null; shareExpiresAt: Date | null; shareRevokedAt: Date | null;
};

export type ShareLinkAccess = {
  authenticationRequired: boolean;
  passwordRequired?: boolean;
  file?: { id: string; name: string; mimeType: string; sizeBytes: number; status: string; dataResidency: string };
  downloadEnabled?: boolean;
};

async function lookup(token: string): Promise<LinkLookup | undefined> {
  const [link] = await authDb.select({
    id: shareLinks.id, organisationId: shareLinks.organisationId, shareId: shareLinks.shareId, fileId: shares.fileId,
    requireAuth: shareLinks.requireAuth, passwordHash: shareLinks.passwordHash, downloadEnabled: shareLinks.downloadEnabled,
    allowedDomains: shareLinks.allowedDomains, allowedIpRanges: shareLinks.allowedIpRanges, allowedCountries: shareLinks.allowedCountries,
    accessCount: shareLinks.accessCount, maxAccessCount: shareLinks.maxAccessCount, oneTime: shareLinks.oneTime,
    consumedAt: shareLinks.consumedAt, linkExpiresAt: shareLinks.expiresAt, linkRevokedAt: shareLinks.revokedAt,
    shareExpiresAt: shares.expiresAt, shareRevokedAt: shares.revokedAt,
  }).from(shareLinks).innerJoin(shares, eq(shares.id, shareLinks.shareId)).where(eq(shareLinks.token, token)).limit(1);
  return link;
}

async function sessionFor(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ? session : null;
}

function meta(headers: Headers) {
  return {
    correlationId: headers.get("x-correlation-id") ?? newCorrelationId(),
    ipAddress: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "unknown",
    userAgent: headers.get("user-agent") ?? undefined,
    country: (headers.get("cf-ipcountry") ?? headers.get("x-country-code"))?.toUpperCase(),
  };
}

function list(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

function ipv4InRange(ip: string, range: string): boolean {
  if (ip === range) return true;
  const [network, prefixRaw] = range.split("/");
  if (!network || !prefixRaw || isIP(ip) !== 4 || isIP(network) !== 4) return false;
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const number = (value: string) => value.split(".").reduce((acc, part) => (acc * 256 + Number(part)) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (number(ip) & mask) === (number(network) & mask);
}

function currentlyActive(link: LinkLookup): boolean {
  const now = Date.now();
  return Boolean(link.fileId) && !link.linkRevokedAt && !link.shareRevokedAt && (!link.linkExpiresAt || link.linkExpiresAt.getTime() > now)
    && (!link.shareExpiresAt || link.shareExpiresAt.getTime() > now) && (link.maxAccessCount === null || link.accessCount < link.maxAccessCount)
    && (!link.oneTime || !link.consumedAt);
}

async function denied(tx: DbTx, link: LinkLookup, action: string, headers: Headers): Promise<void> {
  const request = meta(headers);
  await tx.insert(shareAccessEvents).values({ organisationId: link.organisationId, shareLinkId: link.id, shareId: link.shareId,
    ipAddress: request.ipAddress === "unknown" ? null : request.ipAddress, userAgent: request.userAgent, country: request.country, action });
}

async function authorizeLink(link: LinkLookup, headers: Headers, session: Awaited<ReturnType<typeof sessionFor>>) {
  const request = meta(headers);
  if (!currentlyActive(link)) throw Errors.notFound("Share link unavailable");
  if (link.requireAuth && !session) return "authentication" as const;
  const domains = list(link.allowedDomains);
  const domain = session?.user.email.split("@").at(-1)?.toLowerCase();
  if (domains.length && (!domain || !domains.includes(domain))) throw Errors.denied("share_link_domain_restricted");
  const ranges = list(link.allowedIpRanges);
  if (ranges.length && !ranges.some((range) => ipv4InRange(request.ipAddress, range))) throw Errors.denied("share_link_ip_restricted");
  const countries = list(link.allowedCountries);
  if (countries.length && (!request.country || !countries.includes(request.country))) throw Errors.denied("share_link_country_restricted");
  if (link.passwordHash) {
    const supplied = headers.get("x-share-password") ?? "";
    if (!supplied) return "password" as const;
    if (!verifySecret(supplied, link.passwordHash)) throw Errors.denied("share_link_password_invalid");
  }
  return "allowed" as const;
}

async function consume(link: LinkLookup, action: "viewed" | "downloaded", session: Awaited<ReturnType<typeof sessionFor>>, headers: Headers, fileVersionId?: string) {
  const request = meta(headers);
  await withOrg(link.organisationId, async (tx) => {
    await tx.execute(sql`select id from share_links where id = ${link.id} for update`);
    const [freshLink] = await tx.select({ accessCount: shareLinks.accessCount, maxAccessCount: shareLinks.maxAccessCount,
      consumedAt: shareLinks.consumedAt, revokedAt: shareLinks.revokedAt, expiresAt: shareLinks.expiresAt })
      .from(shareLinks).where(eq(shareLinks.id, link.id)).limit(1);
    const [freshShare] = await tx.select({ revokedAt: shares.revokedAt, expiresAt: shares.expiresAt }).from(shares).where(eq(shares.id, link.shareId)).limit(1);
    if (!freshLink || !freshShare || !currentlyActive({ ...link, ...freshLink, linkRevokedAt: freshLink.revokedAt,
      linkExpiresAt: freshLink.expiresAt, shareRevokedAt: freshShare.revokedAt, shareExpiresAt: freshShare.expiresAt })) throw Errors.notFound("Share link unavailable");
    await tx.update(shareLinks).set({ accessCount: freshLink.accessCount + 1, ...(link.oneTime ? { consumedAt: new Date() } : {}) }).where(eq(shareLinks.id, link.id));
    await tx.insert(shareAccessEvents).values({ organisationId: link.organisationId, shareLinkId: link.id, shareId: link.shareId,
      recipientEmail: session?.user.email ?? null, ipAddress: request.ipAddress === "unknown" ? null : request.ipAddress,
      userAgent: request.userAgent, country: request.country, action, fileVersionId: fileVersionId ?? null });
    await writeAuditEvent(tx, { organisationId: link.organisationId, action: `share_link.${action}`, outcome: "success",
      actorType: session ? "user" : "anonymous", ...(session ? { actorId: session.user.id } : {}), resourceType: "file",
      ...(link.fileId ? { resourceId: link.fileId } : {}), ...(fileVersionId ? { resourceVersion: fileVersionId } : {}),
      correlationId: request.correlationId, ...(request.ipAddress !== "unknown" ? { ipAddress: request.ipAddress } : {}),
      ...(request.userAgent ? { userAgent: request.userAgent } : {}), metadata: { shareId: link.shareId, shareLinkId: link.id, authenticated: Boolean(session) } });
  });
}

async function resolve(token: string, headers: Headers) {
  const request = meta(headers);
  await enforceShareRateLimit("lookup", request.ipAddress);
  const link = await lookup(token);
  if (!link) { await recordInvalidShareLookup(request.ipAddress); throw Errors.notFound("Share link unavailable"); }
  const invalidAttempts = await takeInvalidShareLookupCount(request.ipAddress);
  if (invalidAttempts >= 10) await withOrg(link.organisationId, async (tx) => {
    await tx.insert(securityEvents).values({ organisationId: link.organisationId, type: "enumeration", severity: "high",
      resourceType: "share_link", resourceId: link.id, ipAddress: request.ipAddress === "unknown" ? null : request.ipAddress,
      details: { signal: "invalid_share_token_enumeration", attempts: invalidAttempts }, status: "open" });
  });
  const session = await sessionFor(headers);
  try { return { link, session, gate: await authorizeLink(link, headers, session) }; }
  catch (error) {
    await withOrg(link.organisationId, (tx) => denied(tx, link, headers.get("x-share-password") ? "password_failed" : "denied", headers));
    throw error;
  }
}

export async function getShareLinkAccess(token: string, headers: Headers): Promise<ShareLinkAccess> {
  const { link, session, gate } = await resolve(token, headers);
  if (gate === "authentication") return { authenticationRequired: true };
  if (gate === "password") return { authenticationRequired: false, passwordRequired: true };
  const file = await withOrg(link.organisationId, async (tx) => {
    const [record] = await tx.select({ id: files.id, name: files.name, mimeType: files.mimeType, sizeBytes: files.sizeBytes,
      status: files.status, dataResidency: files.dataResidency, deletedAt: files.deletedAt }).from(files)
      .where(and(eq(files.id, link.fileId!), eq(files.organisationId, link.organisationId))).limit(1);
    if (!record || record.deletedAt) throw Errors.notFound("Share link unavailable");
    return record;
  });
  if (!link.downloadEnabled) await consume(link, "viewed", session, headers);
  return { authenticationRequired: false, file, downloadEnabled: link.downloadEnabled && file.status === "available" };
}

export async function getShareLinkDownload(token: string, headers: Headers): Promise<{ url: string; expiresInSeconds: number }> {
  const { link, session, gate } = await resolve(token, headers);
  if (gate === "authentication") throw Errors.unauthenticated();
  if (gate === "password") throw Errors.unauthenticated("Share password required");
  if (!link.downloadEnabled) throw Errors.denied("share_link_download_disabled");
  const count = await enforceShareRateLimit("download", meta(headers).ipAddress, link.id);
  if (count === 50) await withOrg(link.organisationId, async (tx) => tx.insert(securityEvents).values({ organisationId: link.organisationId,
    type: "rate_limit", severity: "medium", resourceType: "share_link", resourceId: link.id, status: "open",
    details: { signal: "unusual_download_volume", count } }));
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
  await consume(link, "downloaded", session, headers, result.versionId);
  return { url: result.signed.url, expiresInSeconds: result.signed.expiresInSeconds };
}
