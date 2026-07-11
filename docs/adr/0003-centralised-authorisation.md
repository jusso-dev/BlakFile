# ADR 0003 — Centralised authorisation engine (RBAC + ABAC), defence in depth

- Status: Accepted
- Date: 2026-07-11

## Context

Every file, folder, share, search result, preview, embedding, comment, API
response, and MCP result must be authorised server-side. Ad-hoc role checks
scattered through UI components are a broken-access-control risk and impossible
to audit.

## Decision

- A single **policy engine** exposes `authorize(ctx, action, resource): Decision`
  and reusable named policy functions (`canReadFile`, `canDownloadFile`,
  `canShareFile`, `canCreatePublicLink`, `canPermanentlyDeleteFile`,
  `canUseAIWithFile`, `canRunAgentAction`, `canAccessAuditLogs`, …).
- **RBAC**: `roles` + `permissions` catalogue + `roleAssignments` (principal =
  user/group/team/service_account/agent; scope = organisation/workspace/drive/
  folder).
- **ABAC**: policies evaluate attributes — classification, sensitivity, geo/IP,
  device trust, authentication assurance level, session risk, employment type,
  legal-hold state, retention state, time, data residency. **Deny overrides.**
- Decisions return `allow/deny` **plus obligations** (e.g. watermark, step-up
  auth) and a reason, which callers must honour.
- **Defence in depth**: the same tenant boundary is *also* enforced in the
  database by PostgreSQL Row-Level Security (see [ADR 0004](0004-tenant-isolation-rls.md)),
  so an application bug cannot cross tenants.
- Authorisation is re-checked at **every** server boundary, including before every
  agent and MCP tool call.

## Consequences

- Web, API, MCP, and workers share one policy layer; behaviour cannot diverge.
- Every consequential action produces an `auditEvents` record with the policy
  version applied.
- UI components contain no authorisation logic — they render what the server
  already authorised.
