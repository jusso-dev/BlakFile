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
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";
import { folders } from "./workspaces";
import { shares } from "./sharing";

/** An external (guest) user known to an org via email. */
export const externalUsers = pgTable(
  "external_users",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    name: text("name"),
    status: text("status").notNull(), // invited | active | expired | revoked
    invitedBy: uuid("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.email),
  ],
);

/** A tokenised invitation to join as member/guest/external. */
export const invitations = pgTable(
  "invitations",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    invitedBy: uuid("invited_by").notNull(),
    role: text("role"),
    workspaceId: uuid("workspace_id"),
    shareId: uuid("share_id").references(() => shares.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    type: text("type").notNull(), // member | guest | external
    status: text("status").notNull(), // pending | accepted | declined | expired | revoked
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.shareId),
    uniqueIndex().on(t.token),
  ],
);

/** Upload-only inbound collection: outsiders submit files into a target folder. */
export const fileRequests = pgTable(
  "file_requests",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    targetFolderId: uuid("target_folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull(),
    token: text("token").notNull(),
    requireAuth: boolean("require_auth").notNull().default(true),
    allowedEmails: jsonb("allowed_emails"),
    maxSubmissions: integer("max_submissions"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.token),
  ],
);

/** A single submission into a file request. */
export const fileRequestSubmissions = pgTable(
  "file_request_submissions",
  {
    id: pk(),
    fileRequestId: uuid("file_request_id")
      .notNull()
      .references(() => fileRequests.id, { onDelete: "cascade" }),
    submitterEmail: text("submitter_email"),
    submitterName: text("submitter_name"),
    fileId: uuid("file_id"),
    ipAddress: text("ip_address"),
    status: text("status").notNull(), // received | accepted | rejected | scanning
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.fileRequestId)],
);
