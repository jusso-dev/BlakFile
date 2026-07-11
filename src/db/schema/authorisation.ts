import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, permissionLevelEnum } from "./_shared";
import { organisations } from "./organisations";

/**
 * Roles. organisationId null = built-in system role shared across all tenants;
 * non-null = a tenant-defined custom role.
 */
export const roles = pgTable(
  "roles",
  {
    id: pk(),
    organisationId: uuid("organisation_id").references(
      () => organisations.id,
      { onDelete: "cascade" },
    ), // nullable: null => system role
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.organisationId, t.key),
    index().on(t.organisationId),
  ],
);

/** Global permission catalogue (e.g. 'file.read'). Not tenant-scoped. */
export const permissions = pgTable(
  "permissions",
  {
    id: pk(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.key)],
);

/**
 * Core RBAC grant table. Binds a principal (user/group/team/service_account/
 * agent) to a role, at a given scope (organisation/workspace/drive/folder).
 * Effective permissions are the union of all matching assignments; scopeId null
 * means the grant applies org-wide. Optional expiresAt supports time-boxed access.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(), // user | group | team | service_account | agent
    principalId: uuid("principal_id").notNull(),
    scopeType: text("scope_type").notNull(), // organisation | workspace | drive | folder
    scopeId: uuid("scope_id"), // nullable: null => whole organisation
    grantedBy: uuid("granted_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId, t.principalId),
    index().on(t.organisationId),
    index().on(t.roleId),
  ],
);

/** Just-in-time access requests awaiting approval for a resource. */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    requesterId: uuid("requester_id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    requestedLevel: permissionLevelEnum("requested_level").notNull(),
    justification: text("justification"),
    status: text("status").notNull().default("pending"), // pending | approved | denied | expired
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.status),
  ],
);

/** Periodic access certification campaigns over a scope. */
export const accessReviews = pgTable(
  "access_reviews",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    status: text("status").notNull().default("open"), // open | in_progress | completed
    dueAt: timestamp("due_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    findings: jsonb("findings"),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);
