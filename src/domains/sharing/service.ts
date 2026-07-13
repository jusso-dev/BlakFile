import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db";
import { externalUsers, files, invitations, shareLinks, shareRecipients, shares } from "@/db/schema";
import { writeAuditEvent } from "@/domains/audit";
import { authorize, type ResourceRef } from "@/domains/authorisation";
import { buildFileAttributes } from "@/domains/files/attributes";
import type { AppContext } from "@/lib/context";
import { Errors } from "@/lib/errors";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const createShareSchema = z.object({
  permissionLevel: z.enum(["viewer", "downloader", "commenter", "editor", "manager"]),
  recipientEmail: z.string().email().optional(),
  createLink: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
  downloadEnabled: z.boolean().default(false),
  requireAuth: z.boolean().default(true),
});

export type CreateShareInput = z.infer<typeof createShareSchema>;

export type ShareDto = {
  id: string;
  type: string;
  permissionLevel: string;
  recipientEmail: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  link: { id: string; requireAuth: boolean; downloadEnabled: boolean; expiresAt: Date | null; url?: string } | null;
  recipientInviteUrl?: string;
  recipientStatus?: "pending" | "active" | "expired" | "revoked" | "declined";
};

async function fileResource(tx: Parameters<Parameters<typeof withOrg>[1]>[0], org: string, fileId: string): Promise<ResourceRef> {
  const [file] = await tx.select().from(files).where(and(eq(files.id, fileId), eq(files.organisationId, org))).limit(1);
  if (!file || file.deletedAt) throw Errors.notFound("File not found");
  const attributes = await buildFileAttributes(tx, {
    id: file.id,
    driveId: file.driveId,
    folderId: file.folderId,
    ownerId: file.ownerId,
    dataResidency: file.dataResidency,
  });
  return { type: "file", id: file.id, organisationId: org, attributes };
}

function actorType(ctx: AppContext): "user" | "service_account" | "api_client" | "agent" | "system" {
  return ctx.principal.type === "external_user" ? "user" : ctx.principal.type;
}

export async function listShares(ctx: AppContext, fileId: string): Promise<ShareDto[]> {
  const org = ctx.principal.organisationId;
  return withOrg(org, async (tx) => {
    const resource = await fileResource(tx, org, fileId);
    const decision = authorize(ctx.principal, "file.read", resource, ctx.request);
    if (!decision.allow) throw Errors.denied(decision.reason);

    const rows = await tx
      .select({
        id: shares.id,
        type: shares.type,
        permissionLevel: shares.permissionLevel,
        expiresAt: shares.expiresAt,
        revokedAt: shares.revokedAt,
        createdAt: shares.createdAt,
        recipientEmail: shareRecipients.email,
        recipientAcceptedAt: shareRecipients.acceptedAt,
        invitationStatus: invitations.status,
        invitationExpiresAt: invitations.expiresAt,
        linkId: shareLinks.id,
        requireAuth: shareLinks.requireAuth,
        downloadEnabled: shareLinks.downloadEnabled,
        linkExpiresAt: shareLinks.expiresAt,
      })
      .from(shares)
      .leftJoin(shareRecipients, eq(shareRecipients.shareId, shares.id))
      .leftJoin(shareLinks, eq(shareLinks.shareId, shares.id))
      .leftJoin(invitations, eq(invitations.shareId, shares.id))
      .where(and(eq(shares.organisationId, org), eq(shares.fileId, fileId)))
      .orderBy(shares.createdAt);

    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      permissionLevel: row.permissionLevel,
      recipientEmail: row.recipientEmail,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      link: row.linkId
        ? { id: row.linkId, requireAuth: row.requireAuth!, downloadEnabled: row.downloadEnabled!, expiresAt: row.linkExpiresAt }
        : null,
      ...(row.recipientEmail ? { recipientStatus: row.revokedAt ? "revoked" as const
        : (row.expiresAt && row.expiresAt.getTime() <= now) || (row.invitationExpiresAt && row.invitationExpiresAt.getTime() <= now) ? "expired" as const
        : row.invitationStatus === "declined" ? "declined" as const
        : row.recipientAcceptedAt ? "active" as const : "pending" as const } : {}),
    }));
  });
}

export async function createShare(ctx: AppContext, fileId: string, raw: unknown): Promise<ShareDto> {
  const input = createShareSchema.parse(raw);
  const org = ctx.principal.organisationId;
  return withOrg(org, async (tx) => {
    const resource = await fileResource(tx, org, fileId);
    const decision = authorize(ctx.principal, "file.share", resource, ctx.request);
    if (!decision.allow) throw Errors.denied(decision.reason);
    if (input.recipientEmail && !ctx.principal.permissions.has("*") && !ctx.principal.permissions.has("file.share.external"))
      throw Errors.denied("missing_external_share_permission");

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const type = input.createLink ? "link" : "external_email";
    const [share] = await tx.insert(shares).values({
      organisationId: org,
      fileId,
      type,
      permissionLevel: input.permissionLevel,
      createdBy: ctx.principal.id,
      expiresAt,
    }).returning({ id: shares.id, createdAt: shares.createdAt });
    if (!share) throw Errors.internal("Failed to create share");

    let recipientInviteUrl: string | undefined;
    if (input.recipientEmail) {
      await tx.insert(shareRecipients).values({ shareId: share.id, principalType: "external_user", email: input.recipientEmail.toLowerCase() });
      const token = randomBytes(32).toString("base64url");
      const invitationExpiry = expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.insert(invitations).values({ organisationId: org, email: input.recipientEmail.toLowerCase(), invitedBy: ctx.principal.id,
        // `workspaceId` is a generic optional resource reference in the existing
        // schema. Here it binds this invitation to the exact share grant.
        shareId: share.id, token, type: "external", status: "pending", expiresAt: invitationExpiry });
      await tx.insert(externalUsers).values({ organisationId: org, email: input.recipientEmail.toLowerCase(), invitedBy: ctx.principal.id,
        status: "invited", expiresAt: invitationExpiry }).onConflictDoUpdate({ target: [externalUsers.organisationId, externalUsers.email],
          set: { status: "invited", expiresAt: invitationExpiry, invitedBy: ctx.principal.id } });
      recipientInviteUrl = new URL(`/g/${token}`, env.APP_URL).toString();
    }

    let link: ShareDto["link"] = null;
    if (input.createLink) {
      const [createdLink] = await tx.insert(shareLinks).values({
        organisationId: org,
        shareId: share.id,
        token: randomBytes(32).toString("base64url"),
        access: input.downloadEnabled ? "download" : "view_only",
        requireAuth: input.requireAuth,
        downloadEnabled: input.downloadEnabled,
        expiresAt,
      }).returning({ id: shareLinks.id, token: shareLinks.token, requireAuth: shareLinks.requireAuth, downloadEnabled: shareLinks.downloadEnabled, expiresAt: shareLinks.expiresAt });
      if (!createdLink) throw Errors.internal("Failed to create share link");
      link = { ...createdLink, url: new URL(`/s/${createdLink.token}`, env.APP_URL).toString() };
    }

    await writeAuditEvent(tx, {
      organisationId: org, action: "file.shared", outcome: "success", actorType: actorType(ctx), actorId: ctx.principal.id,
      resourceType: "file", resourceId: fileId, correlationId: ctx.request.correlationId,
      metadata: { shareId: share.id, type, permissionLevel: input.permissionLevel, hasRecipient: Boolean(input.recipientEmail), hasLink: input.createLink },
    });
    return { id: share.id, type, permissionLevel: input.permissionLevel, recipientEmail: input.recipientEmail?.toLowerCase() ?? null, expiresAt, revokedAt: null, createdAt: share.createdAt, link, ...(recipientInviteUrl ? { recipientInviteUrl } : {}) };
  });
}

export async function revokeShare(ctx: AppContext, shareId: string): Promise<void> {
  const org = ctx.principal.organisationId;
  await withOrg(org, async (tx) => {
    const [share] = await tx.select().from(shares).where(and(eq(shares.id, shareId), eq(shares.organisationId, org), isNull(shares.revokedAt))).limit(1);
    if (!share || !share.fileId) throw Errors.notFound("Share not found");
    const resource = await fileResource(tx, org, share.fileId);
    const decision = authorize(ctx.principal, "file.share", resource, ctx.request);
    if (!decision.allow) throw Errors.denied(decision.reason);

    const revokedAt = new Date();
    await tx.update(shares).set({ revokedAt }).where(eq(shares.id, shareId));
    await tx.update(shareLinks).set({ revokedAt }).where(eq(shareLinks.shareId, shareId));
    await tx.update(invitations).set({ status: "revoked" }).where(and(eq(invitations.shareId, shareId), or(eq(invitations.status, "pending"), eq(invitations.status, "accepted"))));
    await writeAuditEvent(tx, { organisationId: org, action: "file.share.revoked", outcome: "success", actorType: actorType(ctx), actorId: ctx.principal.id, resourceType: "file", resourceId: share.fileId, correlationId: ctx.request.correlationId, metadata: { shareId } });
  });
}
