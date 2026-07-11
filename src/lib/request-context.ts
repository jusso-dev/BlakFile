/**
 * Builds the authenticated AppContext for API/web/MCP requests. This is the ONLY
 * place a request turns into a trusted principal — services never re-derive
 * identity. Two auth paths are supported in Phase 1:
 *
 *   1. Bearer API credential  (Authorization: Bearer bf_...) — service/API clients
 *   2. Better Auth session cookie — interactive users
 *
 * Permissions are resolved from `roleAssignments` → built-in role catalogue.
 * (Custom-role permission mapping tables land in Phase 6 governance; Phase 1 uses
 * the built-in roles.)
 */
import { and, eq } from "drizzle-orm";
import { db, withOrg } from "@/db";
import { apiClients, apiCredentials, organisationMembers, roleAssignments, roles } from "@/db/schema";
import { verifySecret, credentialPrefix } from "@/lib/crypto";
import { newCorrelationId } from "@/lib/ids";
import { Errors } from "@/lib/errors";
import { permissionsForRole } from "@/domains/authorisation";
import type { AssuranceLevel, Principal, PrincipalType, RequestContext } from "@/domains/authorisation";
import type { AppContext } from "@/lib/context";
import { auth } from "@/lib/auth";

/** Resolve the union of permission keys granted to a principal in an org. */
async function resolvePermissions(
  org: string,
  principalType: string,
  principalId: string,
): Promise<Set<string>> {
  const rows = await withOrg(org, (tx) =>
    tx
      .select({ key: roles.key, expiresAt: roleAssignments.expiresAt })
      .from(roleAssignments)
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .where(
        and(
          eq(roleAssignments.organisationId, org),
          eq(roleAssignments.principalType, principalType),
          eq(roleAssignments.principalId, principalId),
        ),
      ),
  );
  const perms = new Set<string>();
  const now = Date.now();
  for (const r of rows) {
    if (r.expiresAt && r.expiresAt.getTime() < now) continue;
    for (const p of permissionsForRole(r.key)) perms.add(p);
  }
  return perms;
}

function requestMeta(req: Request): { correlationId: string; ip?: string; userAgent?: string } {
  const correlationId = req.headers.get("x-correlation-id") ?? newCorrelationId();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = req.headers.get("user-agent") ?? undefined;
  return { correlationId, ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) };
}

/** Try the Bearer API-credential path. Returns null if no bearer token present. */
async function fromApiCredential(req: Request): Promise<AppContext | null> {
  const authz = req.headers.get("authorization");
  if (!authz?.startsWith("Bearer ")) return null;
  const token = authz.slice("Bearer ".length).trim();
  if (!token.startsWith("bf_")) return null;

  const prefix = credentialPrefix(token);
  // Candidate credentials by non-secret prefix, then constant-time verify.
  const candidates = await db
    .select({
      keyHash: apiCredentials.keyHash,
      org: apiCredentials.organisationId,
      clientId: apiCredentials.apiClientId,
      expiresAt: apiCredentials.expiresAt,
      revokedAt: apiCredentials.revokedAt,
    })
    .from(apiCredentials)
    .where(eq(apiCredentials.prefix, prefix));

  const match = candidates.find(
    (c) => !c.revokedAt && (!c.expiresAt || c.expiresAt.getTime() > Date.now()) && verifySecret(token, c.keyHash),
  );
  if (!match) throw Errors.unauthenticated("Invalid API credential");

  const [client] = await db
    .select({ id: apiClients.id, ownerId: apiClients.ownerId, enabled: apiClients.enabled })
    .from(apiClients)
    .where(and(eq(apiClients.id, match.clientId), eq(apiClients.organisationId, match.org)))
    .limit(1);
  if (!client || !client.enabled) throw Errors.unauthenticated("API client disabled");

  // API clients act as their own principal; permissions come from role grants.
  const principalId = client.id;
  const principalType: PrincipalType = "api_client";
  const permissions = await resolvePermissions(match.org, principalType, principalId);

  const meta = requestMeta(req);
  const principal: Principal = {
    type: principalType,
    id: principalId,
    organisationId: match.org,
    permissions,
    attributes: {},
  };
  const request: RequestContext = {
    correlationId: meta.correlationId,
    assuranceLevel: "aal1", // API credentials are single-factor bearer
    ...(meta.ip ? { ip: meta.ip } : {}),
    now: new Date(),
  };
  return { principal, request };
}

/** Try the Better Auth session path. */
async function fromSession(req: Request): Promise<AppContext | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;

  const userId = session.user.id;
  // Active org: from the session, else the user's first active membership.
  const activeOrg =
    (session.session as { activeOrganisationId?: string | null }).activeOrganisationId ?? null;

  const [membership] = await db
    .select({ org: organisationMembers.organisationId })
    .from(organisationMembers)
    .where(
      activeOrg
        ? and(eq(organisationMembers.userId, userId), eq(organisationMembers.organisationId, activeOrg))
        : eq(organisationMembers.userId, userId),
    )
    .limit(1);
  if (!membership) throw Errors.denied("no_active_organisation");

  const org = membership.org;
  const permissions = await resolvePermissions(org, "user", userId);
  const meta = requestMeta(req);

  const assurance: AssuranceLevel = "aal1"; // MFA/passkey assurance lands in Phase 3
  const principal: Principal = {
    type: "user",
    id: userId,
    organisationId: org,
    permissions,
    attributes: {},
  };
  const request: RequestContext = {
    correlationId: meta.correlationId,
    assuranceLevel: assurance,
    ...(meta.ip ? { ip: meta.ip } : {}),
    now: new Date(),
  };
  return { principal, request };
}

/** Resolve an AppContext or throw `unauthenticated`. */
export async function requireContext(req: Request): Promise<AppContext> {
  const viaKey = await fromApiCredential(req);
  if (viaKey) return viaKey;
  const viaSession = await fromSession(req);
  if (viaSession) return viaSession;
  throw Errors.unauthenticated();
}
