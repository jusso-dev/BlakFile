import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";
import { files } from "./files";

/**
 * Org-defined sensitivity classification (e.g. 'Confidential', 'PROTECTED').
 * Deliberately NOT a hard-coded framework: each tenant defines its own labels,
 * ordering and handling rules. `rank` orders sensitivity; `handlingRules`
 * carries the sharing/download/ai/watermark/retention defaults (§16).
 */
export const classifications = pgTable(
  "classifications",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    colour: text("colour"),
    description: text("description"),
    rank: integer("rank").notNull(), // sensitivity ordering
    handlingRules: jsonb("handling_rules"), // sharing/download/ai/watermark/retention defaults (§16)
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.name),
  ],
);

/**
 * The active classification applied to a file. `unique(fileId)` enforces one
 * active classification per file; re-classification replaces the row.
 */
export const fileClassifications = pgTable(
  "file_classifications",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    classificationId: uuid("classification_id")
      .notNull()
      .references(() => classifications.id, { onDelete: "restrict" }),
    appliedBy: uuid("applied_by"),
    source: text("source").notNull(), // manual | ai_suggested | policy | dlp
    confidence: text("confidence"),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.fileId), // one active classification per file
  ],
);
