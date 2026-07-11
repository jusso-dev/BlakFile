# ADR 0007 — Append-only, tamper-evident audit log

- Status: Accepted
- Date: 2026-07-11

## Context

Audit logging is a core product capability for regulated and government-adjacent
customers, not a debug feature. Records must be evidentiary and tamper-evident,
and must never leak sensitive payloads.

## Decision

- **`auditEvents` is append-only** — no `updatedAt`, no application `UPDATE`/
  `DELETE` path. Writes happen server-side only (never from the browser).
- **Tamper-evident hash chain**: each event stores `prevHash` and
  `hash = H(prevHash || canonical(event))`, so any retroactive edit or deletion
  breaks the chain and is detectable by the integrity verifier.
- Rich actor + context capture: actor type/id/display, impersonator, action,
  resource type/id/version, outcome, IP, user agent, device, session, API client,
  agent, MCP client, request/correlation IDs, assurance level, before/after state,
  policy version.
- **No FK to `organisations`** (survives tenant row changes) — just an indexed
  `organisationId`.
- **Never stores** file contents, passwords, MFA secrets, tokens, private keys, or
  unrestricted sensitive payloads. `securityEvents` is a separate operational
  stream.

## Consequences

- Supports searchable audit UI, export, SIEM forwarding, long-term archival,
  configurable retention, and integrity verification.
- Operational logs and audit records are separated; access to audit is itself a
  privileged, audited action (`canAccessAuditLogs`).
