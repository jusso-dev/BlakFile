import {
  pgTable,
  uuid,
  text,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, processingStatusEnum } from "./_shared";
import { organisations } from "./organisations";
import { fileVersions } from "./files";

/** Rendered preview asset (thumbnail/pdf/image/text) for a file VERSION. */
export const previews = pgTable(
  "previews",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => fileVersions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // thumbnail | pdf | image | text
    storageObjectId: uuid("storage_object_id"),
    status: processingStatusEnum("status").notNull().default("pending"),
    width: integer("width"),
    height: integer("height"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId), index().on(t.fileVersionId)],
);

/**
 * Extracted plaintext for full-text search, bound to a file VERSION.
 * SECURITY: `content` is a derivative of the file body — reading it MUST be
 * authorised exactly as reading the underlying file. NOTE: the generated
 * `tsvector` column and its GIN index are added via a raw SQL migration
 * (Drizzle does not model generated tsvector columns here).
 */
export const extractedText = pgTable(
  "extracted_text",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => fileVersions.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // parser | ocr | transcript
    language: text("language"),
    charCount: integer("char_count").notNull(),
    content: text("content").notNull(), // extracted plaintext for FTS
    ...timestamps,
  },
  (t) => [index().on(t.organisationId), index().on(t.fileVersionId)],
);
