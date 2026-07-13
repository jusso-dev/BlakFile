import { and, eq } from "drizzle-orm";
import { authDb, withOrg } from "@/db";
import { externalUsers, invitations, shareRecipients } from "@/db/schema";
import { auth } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { writeAuditEvent } from "@/domains/audit";

type Invitation = { id: string; organisationId: string; email: string; shareId: string | null; status: string; expiresAt: Date };

async function lookup(token: string): Promise<Invitation> {
  const [invite] = await authDb.select({ id: invitations.id, organisationId: invitations.organisationId, email: invitations.email,
    shareId: invitations.workspaceId, type: invitations.type, status: invitations.status, expiresAt: invitations.expiresAt }).from(invitations).where(eq(invitations.token, token)).limit(1);
  if (!invite || invite.type !== "external" || invite.status !== "pending" || invite.expiresAt.getTime() <= Date.now() || !invite.shareId) throw Errors.notFound("Invitation unavailable");
  return invite;
}

export async function acceptGuestInvitation(token: string, headers: Headers): Promise<void> {
  const invite = await lookup(token);
  const session = await auth.api.getSession({ headers });
  if (!session?.user) throw Errors.unauthenticated();
  if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) throw Errors.denied("invitation_email_mismatch");
  await withOrg(invite.organisationId, async (tx) => {
    const [recipient] = await tx.select({ id: shareRecipients.id }).from(shareRecipients)
      .where(and(eq(shareRecipients.shareId, invite.shareId!), eq(shareRecipients.email, invite.email))).limit(1);
    if (!recipient) throw Errors.notFound("Invitation unavailable");
    await tx.update(shareRecipients).set({ principalId: session.user.id, acceptedAt: new Date() }).where(eq(shareRecipients.id, recipient.id));
    await tx.update(invitations).set({ status: "accepted", acceptedAt: new Date() }).where(eq(invitations.id, invite.id));
    await tx.update(externalUsers).set({ status: "active", lastAccessAt: new Date() })
      .where(and(eq(externalUsers.organisationId, invite.organisationId), eq(externalUsers.email, invite.email)));
    await writeAuditEvent(tx, { organisationId: invite.organisationId, action: "file.share.recipient.accepted", outcome: "success",
      actorType: "user", actorId: session.user.id, resourceType: "share", resourceId: invite.shareId!, metadata: { invitationId: invite.id } });
  });
}

export async function guestInvitationStatus(token: string, headers: Headers): Promise<{ authenticationRequired: boolean; email?: string }> {
  const invite = await lookup(token);
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return { authenticationRequired: true };
  if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) throw Errors.denied("invitation_email_mismatch");
  return { authenticationRequired: false, email: invite.email };
}
