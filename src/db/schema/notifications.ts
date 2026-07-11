import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";
import { users } from "./identity";

/** A user-facing notification. readAt null = unread; indexed for unread counts. */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.organisationId, t.userId, t.readAt)],
);

/** Per-user delivery preference for a (channel, category) pair. */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // email | in_app | webhook
    category: text("category").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.userId, t.channel, t.category),
  ],
);
