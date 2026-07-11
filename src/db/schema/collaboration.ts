import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";
import { files } from "./files";

/** Threaded comment on a file (optionally anchored to a version/region). */
export const comments = pgTable(
  "comments",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id"),
    authorId: uuid("author_id").notNull(),
    parentCommentId: uuid("parent_comment_id").references(
      (): any => comments.id,
      { onDelete: "cascade" },
    ), // self-ref; null for top-level
    body: text("body").notNull(),
    anchor: jsonb("anchor"), // page/region positioning
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId), index().on(t.fileId)],
);

/** A user mentioned within a comment. */
export const mentions = pgTable(
  "mentions",
  {
    id: pk(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.mentionedUserId)],
);

/** A lightweight task attached to a file or folder. */
export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id"),
    folderId: uuid("folder_id"),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id"),
    createdBy: uuid("created_by").notNull(),
    status: text("status").notNull(), // open | in_progress | done | cancelled
    dueAt: timestamp("due_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.assigneeId),
  ],
);

/** A request to review a specific file version. */
export const reviewRequests = pgTable(
  "review_requests",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id").notNull(),
    requestedBy: uuid("requested_by").notNull(),
    reviewerId: uuid("reviewer_id").notNull(),
    status: text("status").notNull(), // pending | approved | changes_requested | cancelled
    dueAt: timestamp("due_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/**
 * Generic human-approval record referenced across domains (share/access/
 * agent_run/external_invite/classification) via subjectType + subjectId.
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    subjectType: text("subject_type").notNull(), // share | access | agent_run | external_invite | classification
    subjectId: uuid("subject_id").notNull(),
    requestedBy: uuid("requested_by").notNull(),
    approverId: uuid("approver_id"),
    status: text("status").notNull(), // pending | approved | denied | expired
    policyVersion: text("policy_version"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.status),
  ],
);
