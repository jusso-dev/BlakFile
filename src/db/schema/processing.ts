import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, jobStatusEnum } from "./_shared";
import { organisations } from "./organisations";

/** Durable job record mirrored to the queue driver (BullMQ/pg); idempotent. */
export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    // scan | ocr | preview | extract | embed | index | retention |
    // legal_hold | webhook | bulk | notification
    type: text("type").notNull(),
    status: jobStatusEnum("status").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    correlationId: uuid("correlation_id"),
    payload: jsonb("payload"),
    error: text("error"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.status, t.type),
  ],
);
