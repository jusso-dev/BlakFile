# ADR 0004 — Tenant isolation via PostgreSQL Row-Level Security

- Status: Accepted
- Date: 2026-07-11

## Context

Cross-tenant access must be prevented at the application, database, storage,
cache, queue, search, embedding, and logging layers. Application-layer checks
alone are insufficient — one missing `where organisationId = …` would leak data.

## Decision

- Every tenant-scoped table carries a non-null `organisationId` (helper `orgId()`)
  with a supporting index.
- The application connects as a low-privilege role **`blakfile_app` (NOBYPASSRLS)**.
  Migrations run as a separate owner role.
- **RLS policies** on tenant tables filter on
  `organisation_id = current_setting('app.current_org')::uuid`.
- All tenant-scoped queries run through **`withOrg(orgId, fn)`** (`src/db/index.ts`),
  which opens a transaction and calls
  `set_config('app.current_org', orgId, true)` — transaction-scoped, so the value
  cannot leak across pooled connections.
- Other layers echo the boundary: opaque per-org storage keys/prefixes, org-prefixed
  Redis cache keys, org in job payloads validated on dequeue, `organisationId`
  filter in every pgvector/FTS query, org-scoped audit and redacted logs.

## Consequences

- A forgotten application-level filter still fails closed at the database.
- `auditEvents` deliberately has **no** cascading FK to `organisations` (append-only
  survivability); it keeps a plain indexed `organisationId`.
- Multi-tenant isolation tests assert cross-org access is denied at every layer.
