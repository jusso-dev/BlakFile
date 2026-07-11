import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";

/** An outbound webhook subscription. Signing key held in KMS via secretRef. */
export const webhooks = pgTable(
  "webhooks",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    description: text("description"),
    secretRef: text("secret_ref").notNull(), // KMS ref for HMAC signing key
    events: jsonb("events").notNull(), // subscribed event types
    enabled: boolean("enabled").notNull().default(true),
    redactPayload: boolean("redact_payload").notNull().default(true),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** An emitted domain event, versioned, retained for delivery + replay. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(), // e.g. file.uploaded
    version: text("version").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    payload: jsonb("payload").notNull(),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.organisationId, t.type, t.createdAt)],
);

/**
 * A single delivery attempt of an event to a webhook. Uses exponential backoff
 * + dead-letter on exhaustion, and supports manual replay.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    webhookEventId: uuid("webhook_event_id")
      .notNull()
      .references(() => webhookEvents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | delivered | failed | dead_letter
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    signature: text("signature"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index().on(t.webhookId, t.status)],
);
