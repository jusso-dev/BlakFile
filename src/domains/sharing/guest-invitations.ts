import { and, eq } from "drizzle-orm";
import { authDb, withOrg } from "@/db";
import { externalUsers, files, fileVersions, invitations, shareAccessEvents, shareRecipients, shares, storageObjects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { newCorrelationId } from "@/lib/ids";
import { writeAuditEvent } from "@/domains/audit";
import { getStorage } from "@/domains/storage";

type Invitation = { id: string; organisationId: string; email: string; shareId: string; status: string; expiresAt: Date };

async function lookup(token: string): Promise<Invitation> {
  const [invite] = await authDb.select({ id: invitations.id, organisationId: invitations.organisationId,
    email: invitations.email, shareId: invitations.shareId, type: invitations.type,
    status: invitations.status, expiresAt: invitations.expiresAt })
    .from(invitations).where(eq(invitations.token, token)).limit(1);
  if (!invite || invite.type !== "external" || !invite.shareId) throw Errors.notFound("Invitation unavailable");
  return { ...invite, shareId: invite.shareId };
}

async function sessionUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

function requireLive(invite: Invitation): void {
  if (invite.status === "revoked" || invite.status === "declined") throw Errors.notFound("Invitation unavailable");
  if (invite.expiresAt.getTime() <= Date.now()) throw Errors.notFound("Invitation expired");
}

async function requireIntendedUser(invite: Invitation, headers: Headers) {
  const user = await sessionUser(headers);
  if (!user) throw Errors.unauthenticated();
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) throw Errors.denied("invitation_email_mismatch");
  return user;
}

export type GuestInvitationAccess = {
  authenticationRequired: boolean;
  status: "pending" | "active";
  recipientEmail?: string;
  file?: { id: string; name: string; mimeType: string; sizeBytes: number; status: string };
  permissionLevel?: string;
  downloadEnabled?: boolean;
  expiresAt?: Date;
};

export async function guestInvitationStatus(token: string, headers: Headers): Promise<GuestInvitationAccess> {
  const invite = await lookup(token);
  requireLive(invite);
  const user = await sessionUser(headers);
  if (!user) return { authenticationRequired: true, status: invite.status === "accepted" ? "active" : "pending" };
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) throw Errors.denied("invitation_email_mismatch");

  return withOrg(invite.organisationId, async (tx) => {
    const [grant] = await tx.select({ share: shares, recipient: shareRecipients, file: files })
      .from(shares).innerJoin(shareRecipients, eq(shareRecipients.shareId, shares.id))
      .innerJoin(files, eq(files.id, shares.fileId))
      .where(and(eq(shares.id, invite.shareId), eq(shareRecipients.email, invite.email))).limit(1);
    if (!grant || grant.share.revokedAt || (grant.share.expiresAt && grant.share.expiresAt.getTime() <= Date.now()))
      throw Errors.notFound("Invitation unavailable");
    if (invite.status === "accepted" && grant.recipient.principalId !== user.id) throw Errors.denied("invitation_principal_mismatch");
    return { authenticationRequired: false, status: invite.status === "accepted" ? "active" : "pending",
      recipientEmail: invite.email, permissionLevel: grant.share.permissionLevel, expiresAt: grant.share.expiresAt ?? invite.expiresAt,
      downloadEnabled: invite.status === "accepted" && ["downloader", "editor", "manager"].includes(grant.share.permissionLevel)
        && grant.file.status === "available" && grant.file.malwareStatus === "clean" && grant.file.processingStatus === "completed",
      file: { id: grant.file.id, name: grant.file.name, mimeType: grant.file.mimeType, sizeBytes: grant.file.sizeBytes, status: grant.file.status } };
  });
}

export async function acceptGuestInvitation(token: string, headers: Headers): Promise<void> {
  const invite = await lookup(token); requireLive(invite);
  if (invite.status !== "pending" && invite.status !== "accepted") throw Errors.notFound("Invitation unavailable");
  const user = await requireIntendedUser(invite, headers);
  await withOrg(invite.organisationId, async (tx) => {
    const [grant] = await tx.select({ recipientId: shareRecipients.id, principalId: shareRecipients.principalId,
      revokedAt: shares.revokedAt, expiresAt: shares.expiresAt }).from(shareRecipients)
      .innerJoin(shares, eq(shares.id, shareRecipients.shareId))
      .where(and(eq(shareRecipients.shareId, invite.shareId), eq(shareRecipients.email, invite.email))).limit(1);
    if (!grant || grant.revokedAt || (grant.expiresAt && grant.expiresAt.getTime() <= Date.now())) throw Errors.notFound("Invitation unavailable");
    if (grant.principalId && grant.principalId !== user.id) throw Errors.denied("invitation_already_bound");
    const now = new Date();
    await tx.update(shareRecipients).set({ principalId: user.id, acceptedAt: now }).where(eq(shareRecipients.id, grant.recipientId));
    await tx.update(invitations).set({ status: "accepted", acceptedAt: now }).where(eq(invitations.id, invite.id));
    await tx.update(externalUsers).set({ status: "active", lastAccessAt: now })
      .where(and(eq(externalUsers.organisationId, invite.organisationId), eq(externalUsers.email, invite.email)));
    await writeAuditEvent(tx, { organisationId: invite.organisationId, action: "file.share.recipient.accepted", outcome: "success",
      actorType: "user", actorId: user.id, resourceType: "share", resourceId: invite.shareId, metadata: { invitationId: invite.id } });
  });
}

export async function declineGuestInvitation(token: string, headers: Headers): Promise<void> {
  const invite = await lookup(token); requireLive(invite);
  if (invite.status !== "pending") throw Errors.conflict("Invitation is no longer pending");
  const user = await requireIntendedUser(invite, headers);
  await withOrg(invite.organisationId, async (tx) => {
    await tx.update(invitations).set({ status: "declined" }).where(eq(invitations.id, invite.id));
    await writeAuditEvent(tx, { organisationId: invite.organisationId, action: "file.share.recipient.declined", outcome: "success",
      actorType: "user", actorId: user.id, resourceType: "share", resourceId: invite.shareId, metadata: { invitationId: invite.id } });
  });
}

export async function getGuestInvitationDownload(token: string, headers: Headers): Promise<{ url: string; expiresInSeconds: number }> {
  const invite = await lookup(token); requireLive(invite);
  if (invite.status !== "accepted") throw Errors.precondition("Invitation has not been accepted");
  const user = await requireIntendedUser(invite, headers);
  const result = await withOrg(invite.organisationId, async (tx) => {
    const [grant] = await tx.select({ share: shares, recipient: shareRecipients, file: files }).from(shares)
      .innerJoin(shareRecipients, eq(shareRecipients.shareId, shares.id)).innerJoin(files, eq(files.id, shares.fileId))
      .where(and(eq(shares.id, invite.shareId), eq(shareRecipients.email, invite.email))).limit(1);
    if (!grant || grant.recipient.principalId !== user.id || grant.share.revokedAt ||
      (grant.share.expiresAt && grant.share.expiresAt.getTime() <= Date.now())) throw Errors.notFound("Invitation unavailable");
    if (!["downloader", "editor", "manager"].includes(grant.share.permissionLevel)) throw Errors.denied("guest_download_not_permitted");
    if (grant.file.status !== "available" || grant.file.malwareStatus !== "clean" ||
      grant.file.processingStatus !== "completed" || !grant.file.currentVersionId) throw Errors.precondition("File is not available for download");
    const [version] = await tx.select({ id: fileVersions.id, storageObjectId: fileVersions.storageObjectId })
      .from(fileVersions).where(eq(fileVersions.id, grant.file.currentVersionId)).limit(1);
    if (!version) throw Errors.internal("Current version missing");
    const [object] = await tx.select({ objectKey: storageObjects.objectKey }).from(storageObjects)
      .where(eq(storageObjects.id, version.storageObjectId)).limit(1);
    if (!object) throw Errors.internal("Storage object missing");
    const signed = await getStorage().getSignedDownloadUrl(object.objectKey,
      { disposition: "attachment", filename: grant.file.name, contentType: grant.file.mimeType });
    const correlationId = headers.get("x-correlation-id") ?? newCorrelationId();
    await tx.insert(shareAccessEvents).values({ organisationId: invite.organisationId, shareId: invite.shareId,
      recipientEmail: invite.email, action: "downloaded", fileVersionId: version.id });
    await writeAuditEvent(tx, { organisationId: invite.organisationId, action: "file.share.recipient.downloaded", outcome: "success",
      actorType: "user", actorId: user.id, resourceType: "file", resourceId: grant.file.id,
      resourceVersion: version.id, correlationId, metadata: { shareId: invite.shareId, invitationId: invite.id } });
    return signed;
  });
  return { url: result.url, expiresInSeconds: result.expiresInSeconds };
}
