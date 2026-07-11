import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";

/**
 * Tracks a client-driven (often multipart) upload before it becomes a file
 * version. Holds the client's declared metadata; the trusted values are
 * recomputed server-side on completion.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    driveId: uuid("drive_id").notNull(),
    folderId: uuid("folder_id"),
    fileId: uuid("file_id"), // set when uploading a new version of an existing file
    initiatedBy: uuid("initiated_by").notNull(),
    declaredName: text("declared_name").notNull(),
    declaredSize: bigint("declared_size", { mode: "number" }).notNull(),
    declaredMime: text("declared_mime").notNull(),
    storageObjectId: uuid("storage_object_id"),
    storageUploadId: text("storage_upload_id"), // provider multipart upload id
    status: text("status").notNull(), // initiated | uploading | completed | aborted | expired
    checksumSha256: text("checksum_sha256"),
    partCount: integer("part_count"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId), index().on(t.organisationId, t.status)],
);

/** One part of a multipart upload; provider ETag verified on completion. */
export const multipartUploadParts = pgTable(
  "multipart_upload_parts",
  {
    id: pk(),
    uploadSessionId: uuid("upload_session_id")
      .notNull()
      .references(() => uploadSessions.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex().on(t.uploadSessionId, t.partNumber)],
);
