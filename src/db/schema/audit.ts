import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  bigserial,
} from "drizzle-orm/pg-core";
import {
  pk,
  timestamps,
  orgId,
  actorTypeEnum,
  auditOutcomeEnum,
} from "./_shared";
import { organisations } from "./organisations";

/**
 * Append-only, tamper-evident audit log.
 *
 * This table is the system of record for security and compliance. Rows are
 * NEVER updated or deleted (no updatedAt). Each row chains to the previous via
 * `hash = H(prevHash || canonical(event))`, so any excision or edit breaks the
 * chain and is detectable.
 *
 * organisationId is NOT NULL but deliberately carries NO foreign key: the audit
 * trail must survive tenant row changes (org deletion/merge) — evidence cannot
 * cascade away. We add a plain index only.
 *
 * Audit rows MUST NOT contain file contents, passwords, tokens, or keys — only
 * references, hashes, and non-sensitive metadata.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: pk(),
    // Global monotonic sequence — gives the hash chain a deterministic order
    // (createdAt alone can tie). Per-org chains follow the latest seq for the org.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    organisationId: orgId(), // NOT NULL, no FK — audit outlives tenant rows
    actorType: actorTypeEnum("actor_type"),
    actorId: uuid("actor_id"),
    actorDisplay: text("actor_display"),
    impersonatorId: uuid("impersonator_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    resourceVersion: text("resource_version"),
    outcome: auditOutcomeEnum("outcome").notNull(),
    failureReason: text("failure_reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceInfo: text("device_info"),
    sessionId: uuid("session_id"),
    apiClientId: uuid("api_client_id"),
    agentId: uuid("agent_id"),
    mcpClientId: uuid("mcp_client_id"),
    requestId: uuid("request_id"),
    correlationId: uuid("correlation_id"),
    assuranceLevel: text("assurance_level"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    metadata: jsonb("metadata"),
    prevHash: text("prev_hash"),
    hash: text("hash"), // hash = H(prevHash || canonical(event))
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId, t.seq),
    index().on(t.organisationId, t.createdAt),
    index().on(t.organisationId, t.action),
    index().on(t.correlationId),
    index().on(t.resourceType, t.resourceId),
  ],
);

/** Detected security signal requiring triage/response. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    // brute_force | impossible_travel | suspicious_share | malware_detected |
    // dlp_critical | policy_violation | rate_limit | enumeration
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    actorId: uuid("actor_id"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    ipAddress: text("ip_address"),
    details: jsonb("details"),
    status: text("status").notNull(), // open | acknowledged | resolved | false_positive
    resolvedBy: uuid("resolved_by"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.type, t.status),
  ],
);
