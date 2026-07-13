import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  pk,
  timestamps,
  orgId,
  shareTypeEnum,
  permissionLevelEnum,
  linkAccessEnum,
} from "./_shared";
import { organisations } from "./organisations";

/** A grant of access to a file/folder/drive. Exactly one of fileId/folderId/driveId is set. */
export const shares = pgTable(
  "shares",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id"),
    folderId: uuid("folder_id"),
    driveId: uuid("drive_id"),
    type: shareTypeEnum("type").notNull(),
    permissionLevel: permissionLevelEnum("permission_level").notNull(),
    createdBy: uuid("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId), index().on(t.fileId)],
);

/** A principal (user/group/team/external) that a share is granted to. */
export const shareRecipients = pgTable(
  "share_recipients",
  {
    id: pk(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(), // user | group | team | external_user
    principalId: uuid("principal_id"),
    email: text("email"), // for external recipients
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.shareId)],
);

/**
 * A tokenised link for a share. Public/anonymous access is OFF by default:
 * `requireAuth` defaults true. `token` is an opaque, enumeration-resistant
 * secret; `passwordHash` is never stored in plaintext.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "cascade" }),
    token: text("token").notNull(), // opaque, enumeration-resistant
    access: linkAccessEnum("access").notNull(),
    passwordHash: text("password_hash"), // never plaintext
    requireAuth: boolean("require_auth").notNull().default(true),
    requireMfa: boolean("require_mfa").notNull().default(false),
    allowedDomains: jsonb("allowed_domains"),
    allowedIpRanges: jsonb("allowed_ip_ranges"),
    allowedCountries: jsonb("allowed_countries"),
    maxAccessCount: integer("max_access_count"),
    accessCount: integer("access_count").notNull().default(0),
    downloadEnabled: boolean("download_enabled").notNull().default(false),
    watermark: boolean("watermark").notNull().default(false),
    oneTime: boolean("one_time").notNull().default(false),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.token),
  ],
);

/**
 * Per-access event on a share/link. Feeds link access logs and suspicious
 * sharing detection.
 */
export const shareAccessEvents = pgTable(
  "share_access_events",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    shareLinkId: uuid("share_link_id"),
    shareId: uuid("share_id"),
    recipientEmail: text("recipient_email"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    country: text("country"),
    action: text("action").notNull(), // viewed | downloaded | denied | password_failed
    fileVersionId: uuid("file_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.organisationId, t.createdAt)],
);
