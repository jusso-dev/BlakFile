import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  pk,
  timestamps,
  orgId,
  rowVersion,
  fileStatusEnum,
  malwareStatusEnum,
  processingStatusEnum,
} from "./_shared";
import { organisations } from "./organisations";
import { drives, folders } from "./workspaces";
import { storageObjects } from "./storage";

/**
 * A logical file: STABLE identity that survives edits. Content lives in
 * immutable fileVersions; `files.id` never changes so shares, permissions,
 * links and audit references stay valid across new versions.
 * `currentVersionId` is nullable ONLY to break the files<->fileVersions insert
 * cycle: a file is created first, its first version inserted, then this pointer
 * is set. It is expected non-null once the file is `available`.
 */
export const files = pgTable(
  "files",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    driveId: uuid("drive_id")
      .notNull()
      .references(() => drives.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    currentVersionId: uuid("current_version_id"), // ref fileVersions; nullable to break the cycle
    name: text("name").notNull(), // original filename
    normalisedName: text("normalised_name").notNull(),
    mimeType: text("mime_type").notNull(),
    detectedContentType: text("detected_content_type"), // sniffed; may differ from declared
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    custodianId: uuid("custodian_id"),
    status: fileStatusEnum("status").notNull().default("initiated"),
    malwareStatus: malwareStatusEnum("malware_status")
      .notNull()
      .default("pending"),
    processingStatus: processingStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    aiIndexingStatus: text("ai_indexing_status").notNull().default("disabled"),
    previewStatus: text("preview_status").notNull().default("pending"),
    sourceSystem: text("source_system"),
    provenance: jsonb("provenance"), // import/source-provider metadata
    dataResidency: text("data_residency").notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...rowVersion,
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.driveId, t.folderId),
    index().on(t.organisationId, t.status),
    index()
      .on(t.organisationId, t.driveId, t.folderId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Immutable content revision. Embeddings, previews and extracted text bind to a
 * VERSION, not the file — so re-indexing a new upload never mixes content.
 */
export const fileVersions = pgTable(
  "file_versions",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    storageObjectId: uuid("storage_object_id")
      .notNull()
      .references(() => storageObjects.id),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    createdBy: uuid("created_by").notNull(),
    comment: text("comment"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.fileId),
    uniqueIndex().on(t.fileId, t.versionNumber),
  ],
);

/** Check-out / lock on a file to coordinate concurrent edits. */
export const fileLocks = pgTable(
  "file_locks",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    lockedBy: uuid("locked_by").notNull(),
    lockType: text("lock_type").notNull(), // exclusive | shared | checkout
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.fileId)],
);
