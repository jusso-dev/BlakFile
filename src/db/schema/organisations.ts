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
import { pk, timestamps, orgId } from "./_shared";
import { users } from "./identity";

/**
 * Root tenant. NOT tenant-scoped — it IS the tenant that everything else keys
 * off via organisationId. One row per customer organisation.
 */
export const organisations = pgTable(
  "organisations",
  {
    id: pk(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    dataResidency: text("data_residency"), // region, e.g. au | eu | us
    planTier: text("plan_tier"),
    brandingConfig: jsonb("branding_config"),
    settings: jsonb("settings"),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.slug)],
);

/** Verified email domains claimed by an org (for domain-based auto-join/routing). */
export const organisationDomains = pgTable(
  "organisation_domains",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    domain: text("domain").notNull(),
    verified: boolean("verified").notNull().default(false),
    verificationToken: text("verification_token"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.domain), index().on(t.organisationId)],
);

/** Membership of a global user in an organisation. The tenant-scoped identity. */
export const organisationMembers = pgTable(
  "organisation_members",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    employmentType: text("employment_type"), // employee | contractor | guest
    invitedBy: uuid("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.organisationId, t.userId),
    index().on(t.organisationId),
  ],
);

/** Hierarchical teams (org units). parentTeamId enables nested structures. */
export const teams = pgTable(
  "teams",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    parentTeamId: uuid("parent_team_id"), // self-ref, nullable
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.organisationId, t.name),
    index().on(t.organisationId),
  ],
);

/** Team membership join. */
export const teamMembers = pgTable(
  "team_members",
  {
    id: pk(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => organisationMembers.id, { onDelete: "cascade" }),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex().on(t.teamId, t.memberId), index().on(t.memberId)],
);

/** Directory groups — local, or synced from an IdP via SCIM/SAML. */
export const groups = pgTable(
  "groups",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    source: text("source").notNull().default("local"), // local | scim | saml
    externalId: text("external_id"), // IdP-side id, nullable
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.organisationId, t.name),
    index().on(t.organisationId),
  ],
);

/** Group membership join. */
export const groupMembers = pgTable(
  "group_members",
  {
    id: pk(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => organisationMembers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex().on(t.groupId, t.memberId), index().on(t.memberId)],
);
