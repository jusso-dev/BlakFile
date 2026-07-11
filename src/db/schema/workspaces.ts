import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, driveTypeEnum } from "./_shared";
import { organisations } from "./organisations";

/** Collaboration container (project, department, data room, external space). */
export const workspaces = pgTable(
  "workspaces",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    type: text("type").notNull(), // project | department | data_room | external
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    settings: jsonb("settings"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.organisationId, t.slug),
  ],
);

/** Workspace membership: an org member's role within a workspace. */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull(), // organisationMembers.id
    role: text("role").notNull(),
    addedBy: uuid("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex().on(t.workspaceId, t.memberId)],
);

/** A storage root (personal, team, shared, workspace, or data room drive). */
export const drives = pgTable(
  "drives",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    type: driveTypeEnum("type").notNull(),
    ownerId: uuid("owner_id"), // personal drive owner; null for shared/team
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    quotaBytes: bigint("quota_bytes", { mode: "number" }),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    dataResidency: text("data_residency").notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId), index().on(t.organisationId, t.type)],
);

/**
 * Folder tree using the materialised-path pattern: `path` stores the full
 * ancestor chain (e.g. '/a/b/') so subtree queries are a single indexed
 * `path LIKE '/a/b/%'` scan instead of recursive CTEs. `parentFolderId`
 * self-references for direct-parent navigation; `depth` mirrors path length.
 * Moves/renames must rewrite `path` for the whole subtree.
 */
export const folders = pgTable(
  "folders",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    driveId: uuid("drive_id")
      .notNull()
      .references(() => drives.id, { onDelete: "cascade" }),
    parentFolderId: uuid("parent_folder_id").references(
      (): any => folders.id,
      { onDelete: "cascade" },
    ), // self-ref; null at drive root
    name: text("name").notNull(),
    path: text("path").notNull(), // materialised path, e.g. '/a/b/'
    depth: integer("depth").notNull(),
    createdBy: uuid("created_by"),
    isTemplate: boolean("is_template").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.driveId, t.parentFolderId),
    index().on(t.path),
  ],
);
