import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";

/** Legal hold; overrides retention + blocks permanent deletion. */
export const legalHolds = pgTable(
  "legal_holds",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    matter: text("matter"),
    description: text("description"),
    custodianNote: text("custodian_note"),
    status: text("status").notNull(), // active | released
    createdBy: uuid("created_by").notNull(),
    releasedBy: uuid("released_by"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.status),
  ],
);

/** Resource scoped into a legal hold. */
export const legalHoldResources = pgTable(
  "legal_hold_resources",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    legalHoldId: uuid("legal_hold_id")
      .notNull()
      .references(() => legalHolds.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(), // file | folder | drive | workspace | custodian
    resourceId: uuid("resource_id").notNull(),
    addedBy: uuid("added_by").notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.legalHoldId, t.resourceType, t.resourceId),
    index().on(t.resourceType, t.resourceId),
  ],
);
