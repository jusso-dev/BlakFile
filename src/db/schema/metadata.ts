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
import { files } from "./files";

/** Free-form org tag vocabulary (e.g. 'urgent', 'q3-2026'). */
export const tags = pgTable(
  "tags",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    colour: text("colour"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.name),
  ],
);

/** Join: tag applied to a file. */
export const fileTags = pgTable(
  "file_tags",
  {
    id: pk(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex().on(t.fileId, t.tagId)],
);

/** Key/value labels (structured, coloured) distinct from free-form tags. */
export const labels = pgTable(
  "labels",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    colour: text("colour"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.key, t.value),
  ],
);

/** A named custom-metadata schema bound to a subject type. */
export const metadataSchemas = pgTable(
  "metadata_schemas",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    appliesTo: text("applies_to").notNull(), // file | folder | workspace
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.name),
  ],
);

/** A single typed field within a metadata schema. */
export const metadataFields = pgTable(
  "metadata_fields",
  {
    id: pk(),
    schemaId: uuid("schema_id")
      .notNull()
      .references(() => metadataSchemas.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(), // text | number | date | select | boolean | user
    required: boolean("required").notNull().default(false),
    options: jsonb("options"), // select choices etc.
    orderIndex: integer("order_index").notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.schemaId),
    uniqueIndex().on(t.schemaId, t.key),
  ],
);

/** Typed metadata value set on a file for a given field. */
export const fileMetadataValues = pgTable(
  "file_metadata_values",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => metadataFields.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNumber: text("value_number"), // numeric stored as text for lossless precision
    valueDate: timestamp("value_date", { withTimezone: true }),
    valueJson: jsonb("value_json"),
    setBy: uuid("set_by"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.fileId, t.fieldId),
  ],
);
