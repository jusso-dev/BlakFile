import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, processingStatusEnum } from "./_shared";
import { organisations } from "./organisations";
import { fileVersions } from "./files";

/** DLP inspection run over a file version. */
export const dlpScans = pgTable(
  "dlp_scans",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => fileVersions.id, { onDelete: "cascade" }),
    status: processingStatusEnum("status").notNull(),
    engine: text("engine").notNull(),
    matchCount: integer("match_count").notNull().default(0),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.fileVersionId),
  ],
);

/** A single DLP detector hit; findings are access-controlled + auditable. */
export const dlpFindings = pgTable(
  "dlp_findings",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    dlpScanId: uuid("dlp_scan_id")
      .notNull()
      .references(() => dlpScans.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id").notNull(),
    detectorKey: text("detector_key").notNull(), // pii.tfn | credential.aws_key ...
    category: text("category").notNull(),
    severity: text("severity").notNull(), // low | medium | high | critical
    count: integer("count").notNull(),
    sampleRedacted: text("sample_redacted"), // REDACTED sample only — never store raw sensitive match
    location: jsonb("location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.severity),
  ],
);
