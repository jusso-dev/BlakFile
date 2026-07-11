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

/** A registered MCP client bound to a principal, with tool/workspace allowlists. */
export const mcpClients = pgTable(
  "mcp_clients",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    transport: text("transport").notNull(), // stdio | http
    principalType: text("principal_type").notNull(), // service_account | agent | user
    principalId: uuid("principal_id"),
    allowedTools: jsonb("allowed_tools"),
    allowedWorkspaces: jsonb("allowed_workspaces"),
    rateLimitPerMinute: integer("rate_limit_per_minute"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** A live MCP connection. Session token stored hashed, never plaintext. */
export const mcpSessions = pgTable(
  "mcp_sessions",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    mcpClientId: uuid("mcp_client_id")
      .notNull()
      .references(() => mcpClients.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash"),
    ipAddress: text("ip_address"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.mcpClientId)],
);

/**
 * Audit of each MCP tool call. Every MCP response returns only authorised data;
 * `authorised` records the decision made before the tool ran.
 */
export const mcpToolInvocations = pgTable(
  "mcp_tool_invocations",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    mcpSessionId: uuid("mcp_session_id")
      .notNull()
      .references(() => mcpSessions.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(),
    argsRedacted: jsonb("args_redacted"),
    outcome: text("outcome").notNull(), // success | denied | error
    authorised: boolean("authorised").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    durationMs: integer("duration_ms"),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.toolKey),
  ],
);
