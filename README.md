<details>
<summary>BlakFile logo</summary>

<p align="center">
  <img src="docs/assets/blakfile-logo.png" alt="BlakFile" width="440" />
</p>
</details>

# BlakFile

**Secure, AI-native, multi-tenant enterprise file sharing, collaboration &
governance platform.** Self-hostable. API-first. MCP-native. Agent-friendly.
Designed for regulated, government-adjacent, and Australian data-sovereignty
requirements.

## Interface preview

The current web product is a responsive workspace overview. The six captures
below show the governed Northwind Regional Health fixture across supported
desktop, tablet, and mobile layouts. They are rendered from the isolated Docker
stack.

| Screenshot | Viewport | What it shows |
|---|---:|---|
| [`landing-page-desktop-light.png`](docs/screenshots/landing-page-desktop-light.png) | 1440 × 900 | Full workspace layout with navigation and governed file list. |
| [`landing-page-tablet-landscape.png`](docs/screenshots/landing-page-tablet-landscape.png) | 1024 × 768 | Workspace layout at tablet landscape width. |
| [`landing-page-tablet-portrait.png`](docs/screenshots/landing-page-tablet-portrait.png) | 768 × 1024 | Workspace layout at tablet portrait width. |
| [`landing-page-mobile.png`](docs/screenshots/landing-page-mobile.png) | 390 × 844 | Standard mobile workspace layout. |
| [`landing-page-mobile-compact.png`](docs/screenshots/landing-page-mobile-compact.png) | 320 × 568 | Compact mobile workspace layout. |
| [`landing-page-mobile-landscape.png`](docs/screenshots/landing-page-mobile-landscape.png) | 844 × 390 | Phone landscape workspace layout. |

### Desktop

<details>
<summary>Show desktop capture</summary>

<img src="docs/screenshots/landing-page-desktop-light.png" alt="BlakFile workspace on desktop" width="100%" />
</details>

### Tablet

<details>
<summary>Show tablet captures</summary>

<img src="docs/screenshots/landing-page-tablet-landscape.png" alt="BlakFile workspace on a landscape tablet" width="100%" />

<img src="docs/screenshots/landing-page-tablet-portrait.png" alt="BlakFile workspace on a portrait tablet" width="768" />
</details>

### Mobile

<details>
<summary>Show mobile captures</summary>

<img src="docs/screenshots/landing-page-mobile.png" alt="BlakFile workspace on a standard mobile viewport" width="390" />

<img src="docs/screenshots/landing-page-mobile-compact.png" alt="BlakFile workspace on a compact mobile viewport" width="320" />

<img src="docs/screenshots/landing-page-mobile-landscape.png" alt="BlakFile workspace on a landscape mobile viewport" width="844" />
</details>

BlakFile treats every file as a governed, searchable, auditable, policy-aware,
automation-ready enterprise object — accessible to people, systems, APIs, AI
assistants, and autonomous agents through **one consistent, governed, auditable
security model**.

> **Status:** Phase 1 foundation in progress. Landed: the full database schema
> (95 Drizzle tables across 28 domain modules) with migrations + RLS policies;
> the central RBAC/ABAC policy engine; append-only hash-chained audit; the
> pluggable storage (S3/MinIO/local) and queue (BullMQ) abstractions; Better Auth
> wiring; a working **secure upload → complete → download** REST slice; seed data
> for two isolated tenants; and passing unit + tenant-isolation tests. Still to
> come across later phases: sharing, enterprise identity (passkeys/SSO/SCIM),
> intelligent content, MCP server, agents, and governance — see [Roadmap](#roadmap).

## Principles

- **Security by default** — links private, public sharing off, signed URLs
  short-lived (120s) over opaque object keys, AI off unless enabled, authorise at
  every server boundary.
- **Privacy by design** — data minimisation, configurable residency, customer-managed
  keys/BYOK, no training on customer data, cryptographic-erase workflows.
- **Explicit authorisation** — centralised RBAC + ABAC policy engine, re-checked at
  every boundary (including before every agent/MCP tool call), backed by database
  Row-Level Security.
- **API & MCP as first-class** — web, REST API, MCP, webhooks, and workers all
  consume the **same** domain services.
- **Human accountability** — every consequential AI/agent action is attributable
  and captured in an append-only, tamper-evident audit log.

## Technology

Next.js 16 (App Router, RSC, Server Actions) · TypeScript strict · Better Auth
(passkeys, MFA, SSO/SAML/OIDC, SCIM) · PostgreSQL 16 + pgvector + Drizzle ORM ·
BullMQ/Redis (queue abstracted) · S3/R2/Azure/GCS/MinIO (storage abstracted) ·
provider-neutral AI (Ollama default, disabled by default) · MCP server · Tailwind
v4 + Radix/shadcn. See [ADR 0001](docs/adr/0001-technology-stack.md).

## Repository layout

```
src/
  db/schema/       95 Drizzle tables, one file per domain (barrel: index.ts)
  db/index.ts      DB client + withOrg() tenant-context helper (RLS)
  domains/         28 domain modules (identity, files, sharing, ai, agents, mcp, …)
  lib/             shared cross-cutting utilities
docs/              architecture + security design (see index below)
docs/adr/          architecture decision records
docker/            local infra init (Postgres extensions, roles)
docker-compose.yml Postgres(+pgvector) · Redis · MinIO · ClamAV · Ollama (profile)
```

## Quick start (local development)

```bash
cp .env.example .env.local          # dev defaults only — no real secrets
docker compose up -d                # Postgres, Redis, MinIO, ClamAV
npm install --legacy-peer-deps      # better-auth peer ranges
npm run db:setup                    # migrate + apply RLS policies + seed 2 orgs
npm run dev                         # web + API at http://localhost:3000
# npm run worker                    # background processing (Phase 1+)
# npm run mcp                       # MCP server (Phase 5)
```

`db:setup` runs `db:migrate` (as the owner role), `db:rls` (enables Row-Level
Security on every tenant table), then `db:seed`, which prints two **one-time API
keys** — one per demo org. Use one to exercise the API:

```bash
# Create a secure upload session (Org-scoped by the key's org)
curl -X POST http://localhost:3000/api/v1/uploads \
  -H "Authorization: Bearer bf_live_..." -H "Content-Type: application/json" \
  -d '{"driveId":"<shared-drive-id>","name":"report.pdf","sizeBytes":1024,"mimeType":"application/pdf"}'
```

Optional local AI: `docker compose --profile ai up -d ollama`.

### Verify tenant isolation

```bash
INTEGRATION_DB=1 \
  DATABASE_URL=postgres://blakfile_app:blakfile@localhost:5432/blakfile \
  DATABASE_MIGRATION_URL=postgres://blakfile:blakfile@localhost:5432/blakfile \
  npx vitest run src/db/tenant-isolation.integration.test.ts
```

Proves RLS fails closed without a tenant context, scopes to one org with one, and
that the audit log rejects `UPDATE`/`DELETE` from the app role.

## Documentation

| Area | Doc |
|---|---|
| System architecture | [architecture.md](docs/architecture.md) |
| Data model | [data-model.md](docs/data-model.md) |
| Authorisation (RBAC + ABAC) | [authorisation-model.md](docs/authorisation-model.md) |
| Security model & controls | [security-model.md](docs/security-model.md) |
| Threat model (STRIDE) | [threat-model.md](docs/threat-model.md) |
| Tenant isolation | [tenant-isolation.md](docs/tenant-isolation.md) |
| Storage architecture | [storage-architecture.md](docs/storage-architecture.md) |
| Upload pipeline | [upload-pipeline.md](docs/upload-pipeline.md) |
| Data lifecycle (retention/legal hold) | [data-lifecycle.md](docs/data-lifecycle.md) |
| Sharing & data rooms | [sharing-model.md](docs/sharing-model.md) |
| AI privacy model | [ai-privacy-model.md](docs/ai-privacy-model.md) |
| Agent security model | [agent-security-model.md](docs/agent-security-model.md) |
| MCP security model | [mcp-security-model.md](docs/mcp-security-model.md) |
| REST API & authentication | [api-and-auth.md](docs/api-and-auth.md) |
| Decision records | [docs/adr/](docs/adr/) |

## Roadmap

Built in vertical slices; the project stays runnable after each.

1. **Foundation** — auth, orgs, RBAC/ABAC, storage abstraction, drives/folders,
   secure upload/download, versions, audit, search. *(schema + design complete)*
2. **Secure sharing** — internal sharing, guest invites, secure links, file
   requests, data rooms, external-sharing policy.
3. **Enterprise identity** — passkeys, MFA, SAML/OIDC, SCIM, device/session mgmt,
   org auth policies.
4. **Intelligent content** — text extraction, OCR, previews, FTS + pgvector,
   semantic search, summaries, Ask-Your-Files.
5. **API, MCP & agents** — REST API + OpenAPI, MCP server, service accounts, agent
   identities/runs/approvals.
6. **Governance** — classifications, DLP, retention, legal holds, access reviews,
   SIEM, customer-managed keys.

## Security

No secret in `.env.example` is real. Everything sensitive is stored as a KMS
reference or a hash — never plaintext. Tenant isolation is enforced in the
application **and** the database (RLS). See [docs/security-model.md](docs/security-model.md).

## Licence

Released under the [MIT License](LICENSE).
