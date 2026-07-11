import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, agentRunStatusEnum } from "./_shared";
import { organisations } from "./organisations";

/**
 * An agent is an EXPLICIT identity. It never exceeds the initiating user's
 * permissions unless separately authorised via its own roleId/credentialRef.
 */
export const agents = pgTable(
  "agents",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    // file_organiser | records | classification | access_review | sharing_review
    // | duplicate_cleanup | data_room | contract_review | knowledge | migration
    // | retention | security | dlp_triage | legal_discovery
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    roleId: uuid("role_id"),
    allowedWorkspaces: jsonb("allowed_workspaces"),
    modelRestrictions: jsonb("model_restrictions"),
    rateLimitPerHour: integer("rate_limit_per_hour"),
    maxStepsDefault: integer("max_steps_default").notNull(),
    maxTokenBudget: integer("max_token_budget"),
    approvalThreshold: text("approval_threshold").notNull(), // none | destructive | all
    killSwitch: boolean("kill_switch").notNull().default(false),
    credentialRef: text("credential_ref"), // KMS ref; never plaintext
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** Per-agent tool allowlist. A tool absent here is unavailable to the agent. */
export const agentTools = pgTable(
  "agent_tools",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(), // e.g. move_file
    enabled: boolean("enabled").notNull().default(true),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    argSchema: jsonb("arg_schema"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.agentId, t.toolKey),
  ],
);

/** A single agent execution against a goal, bounded by budgets + policy snapshot. */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    correlationId: uuid("correlation_id").notNull(),
    initiatorType: text("initiator_type").notNull(), // user | service_account | schedule
    initiatorId: uuid("initiator_id").notNull(),
    goal: text("goal").notNull(),
    inputResources: jsonb("input_resources").notNull(),
    status: agentRunStatusEnum("status").notNull().default("requested"),
    maxSteps: integer("max_steps").notNull(),
    maxRuntimeMs: integer("max_runtime_ms"),
    maxTokenBudget: integer("max_token_budget"),
    tokensUsed: integer("tokens_used").notNull().default(0),
    // policy version applied, captured at run start so decisions are auditable
    policySnapshot: jsonb("policy_snapshot").notNull(),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.status),
    index().on(t.correlationId),
  ],
);

/** Ordered step of an agent run. Args/results redacted; provenance captured. */
export const agentRunSteps = pgTable(
  "agent_run_steps",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    type: text("type").notNull(), // plan | tool_call | observation | message
    toolKey: text("tool_key"),
    argsRedacted: jsonb("args_redacted"),
    resultRedacted: jsonb("result_redacted"),
    // authorisation is re-checked before EVERY tool call, not just at run start
    authorised: boolean("authorised"),
    provenance: jsonb("provenance"),
    tokensUsed: integer("tokens_used"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.agentRunId, t.stepIndex),
  ],
);

/** Human-in-the-loop approval gate for destructive or high-risk agent steps. */
export const agentApprovals = pgTable(
  "agent_approvals",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index"),
    requestedBy: uuid("requested_by"),
    approverId: uuid("approver_id"),
    status: text("status").notNull().default("pending"), // pending | approved | denied
    reason: text("reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);
