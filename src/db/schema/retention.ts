import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, retentionActionEnum } from "./_shared";
import { organisations } from "./organisations";

/** Rule set governing how long a resource is kept and what happens next. */
export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    trigger: text("trigger").notNull(), // creation | last_modified | event | custom_metadata
    retainForDays: integer("retain_for_days").notNull(),
    action: retentionActionEnum("action").notNull(),
    requiresDispositionReview: boolean("requires_disposition_review")
      .notNull()
      .default(false),
    archiveStorageClass: text("archive_storage_class"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.name),
  ],
);

/** Binds a retention policy to a resource and tracks its disposition state. */
export const retentionAssignments = pgTable(
  "retention_assignments",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    retentionPolicyId: uuid("retention_policy_id")
      .notNull()
      .references(() => retentionPolicies.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(), // drive | folder | file | workspace | classification
    resourceId: uuid("resource_id").notNull(),
    assignedBy: uuid("assigned_by").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    computedDispositionAt: timestamp("computed_disposition_at", {
      withTimezone: true,
    }),
    state: text("state").notNull(), // active | due | disposed | held
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.state),
    index().on(t.computedDispositionAt),
  ],
);

/** Human sign-off on disposition; produces destruction certificate evidence. */
export const dispositionReviews = pgTable(
  "disposition_reviews",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    retentionAssignmentId: uuid("retention_assignment_id")
      .notNull()
      .references(() => retentionAssignments.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    reviewerId: uuid("reviewer_id"),
    decision: text("decision").notNull(), // destroy | retain | extend
    status: text("status").notNull(), // pending | approved | rejected
    destructionCertificateRef: text("destruction_certificate_ref"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);
