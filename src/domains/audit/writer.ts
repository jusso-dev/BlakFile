/**
 * Append-only audit writer. ALWAYS runs inside the caller's transaction so the
 * audit record commits atomically with the action it records. Serialises per-org
 * writes with an advisory lock so the hash chain has no races.
 *
 * Never call this from the browser. Never pass secrets/content in `metadata`.
 */
import { sql, desc, eq } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import type { DbTx } from "@/db";
import { computeHash, type AuditHashInput } from "./hash";

export interface AuditInput {
  organisationId: string;
  action: string;
  outcome: "success" | "failure" | "denied" | "error";
  actorType?: "user" | "service_account" | "api_client" | "agent" | "system" | "external_user" | "anonymous";
  actorId?: string;
  actorDisplay?: string;
  impersonatorId?: string;
  resourceType?: string;
  resourceId?: string;
  resourceVersion?: string;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  apiClientId?: string;
  agentId?: string;
  mcpClientId?: string;
  requestId?: string;
  correlationId?: string;
  assuranceLevel?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Stable 32-bit namespace for the per-org advisory lock class.
const LOCK_CLASS = 0x4241_4b46 | 0; // "BAKF"

export async function writeAuditEvent(tx: DbTx, input: AuditInput): Promise<{ hash: string }> {
  // Serialise concurrent writers for this org so prevHash is read consistently.
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_CLASS}, hashtext(${input.organisationId}))`);

  const [prev] = await tx
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.organisationId, input.organisationId))
    .orderBy(desc(auditEvents.seq))
    .limit(1);

  const prevHash = prev?.hash ?? null;
  const createdAt = new Date();

  const hashInput: AuditHashInput = {
    organisationId: input.organisationId,
    action: input.action,
    outcome: input.outcome,
    actorType: input.actorType ?? null,
    actorId: input.actorId ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    resourceVersion: input.resourceVersion ?? null,
    correlationId: input.correlationId ?? null,
    createdAt: createdAt.toISOString(),
    metadata: input.metadata ?? null,
  };
  const hash = computeHash(prevHash, hashInput);

  await tx.insert(auditEvents).values({
    organisationId: input.organisationId,
    action: input.action,
    outcome: input.outcome,
    actorType: input.actorType,
    actorId: input.actorId,
    actorDisplay: input.actorDisplay,
    impersonatorId: input.impersonatorId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceVersion: input.resourceVersion,
    failureReason: input.failureReason,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    sessionId: input.sessionId,
    apiClientId: input.apiClientId,
    agentId: input.agentId,
    mcpClientId: input.mcpClientId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    assuranceLevel: input.assuranceLevel,
    beforeState: input.beforeState,
    afterState: input.afterState,
    metadata: input.metadata,
    prevHash,
    hash,
    createdAt,
  });

  return { hash };
}
