/**
 * Shared schema conventions. Import these helpers everywhere so every table
 * looks the same. Consistency here is a security property, not cosmetics:
 * every tenant-scoped row carries `organisationId`, and RLS keys off it.
 */
import { sql } from "drizzle-orm";
import { pgEnum, timestamp, uuid, text } from "drizzle-orm/pg-core";

/** UUIDv4 primary key generated in-database. */
export const pk = () =>
  uuid("id").primaryKey().default(sql`gen_random_uuid()`);

/** created_at / updated_at pair present on virtually every table. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Tenant key. Every tenant-scoped table MUST include this and an index on it.
 * RLS policy: USING (organisation_id = current_setting('app.current_org')::uuid).
 * We deliberately do NOT add the FK inline here to avoid a circular import with
 * the organisations table; callers add `.references(() => organisations.id)`.
 */
export const orgId = () => uuid("organisation_id").notNull();

/**
 * Actor attribution. Nullable because the actor may be a system/service/agent
 * identity rather than a user. Audit rows capture the full actor descriptor.
 */
export const actorColumns = {
  actorType: text("actor_type"), // user | service_account | api_client | agent | system
  actorId: uuid("actor_id"),
};

/** Optimistic concurrency token for check-in/out and version-safe updates. */
export const rowVersion = {
  version: text("row_version").notNull().default("1"),
};

// --------------------------------------------------------------------------
// Enumerations shared across domains. Keep names stable — they become PG types.
// --------------------------------------------------------------------------

export const actorTypeEnum = pgEnum("actor_type", [
  "user",
  "service_account",
  "api_client",
  "agent",
  "system",
  "external_user",
  "anonymous",
]);

/** Lifecycle of a file's binary in the secure upload pipeline (§7). */
export const fileStatusEnum = pgEnum("file_status", [
  "initiated",
  "uploading",
  "uploaded",
  "quarantined",
  "scanning",
  "rejected",
  "processing",
  "available",
  "restricted",
  "archived",
  "pending_deletion",
  "deleted",
]);

export const malwareStatusEnum = pgEnum("malware_status", [
  "pending",
  "scanning",
  "clean",
  "infected",
  "suspicious",
  "unsupported",
  "error",
]);

export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const driveTypeEnum = pgEnum("drive_type", [
  "personal",
  "team",
  "shared",
  "workspace",
  "data_room",
]);

export const shareTypeEnum = pgEnum("share_type", [
  "user",
  "group",
  "team",
  "workspace",
  "external_email",
  "link",
  "file_request",
]);

export const permissionLevelEnum = pgEnum("permission_level", [
  "viewer",       // preview only
  "downloader",   // preview + download
  "commenter",
  "editor",
  "manager",      // can reshare / manage members
  "owner",
]);

export const linkAccessEnum = pgEnum("link_access", [
  "view_only",
  "download",
  "upload_only",
  "comment",
  "edit",
]);

/** Assurance level of the caller's authentication for step-up decisions. */
export const assuranceLevelEnum = pgEnum("assurance_level", [
  "aal1", // password / single factor
  "aal2", // MFA
  "aal3", // phishing-resistant (passkey / hardware)
]);

export const auditOutcomeEnum = pgEnum("audit_outcome", [
  "success",
  "failure",
  "denied",
  "error",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "requested",
  "awaiting_approval",
  "approved",
  "running",
  "paused",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
  "rolled_back",
]);

export const retentionActionEnum = pgEnum("retention_action", [
  "retain",
  "review",
  "archive",
  "delete",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "active",
  "completed",
  "failed",
  "delayed",
  "cancelled",
]);

/** Vector dimensionality for embeddings. Model-dependent; nomic-embed = 768. */
export const EMBEDDING_DIM = 768;
