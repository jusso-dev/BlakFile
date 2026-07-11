import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";

/** Metered usage sample for a billing period. Aggregated for invoices/reports. */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    // storage_bytes | api_calls | ai_tokens | egress_bytes | seats
    metric: text("metric").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.organisationId, t.metric, t.periodStart)],
);

/** An enforced limit for a metric within a scope, with running `used` counter. */
export const quotas = pgTable(
  "quotas",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    scopeType: text("scope_type").notNull(), // organisation | workspace | drive | user
    scopeId: uuid("scope_id"),
    metric: text("metric").notNull(),
    limit: bigint("limit", { mode: "number" }).notNull(),
    used: bigint("used", { mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.scopeType, t.scopeId, t.metric),
  ],
);

/** Feature toggle. Null organisationId = global default; org rows override it. */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: pk(),
    organisationId: uuid("organisation_id").references(
      () => organisations.id,
      { onDelete: "cascade" },
    ),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config"),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.organisationId, t.key)],
);
