# ADR 0001 — Technology stack

- Status: Accepted
- Date: 2026-07-11

## Context

BlakFile is an enterprise-first, security-first, self-hostable, multi-tenant file
platform that must serve human users, REST API clients, an MCP server, webhooks,
background workers, and autonomous agents through one governed model.

## Decision

- **Next.js 16 (App Router, RSC by default, Server Actions, Route Handlers)** on
  the Node.js runtime. One codebase serves the web UI and the `/api/v1` surface;
  RSC keeps data access server-side by default, which aligns with "authorise at
  every server boundary".
- **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Better Auth** with the PostgreSQL adapter for identity — passkeys/WebAuthn,
  TOTP MFA, recovery codes, SSO (SAML/OIDC), SCIM. We do not hand-roll auth crypto.
- **PostgreSQL 16 + Drizzle ORM + Drizzle Kit** migrations. **pgvector** for
  embeddings, **pg_trgm**/full-text for search, **citext** for email/domain.
- **BullMQ on Redis** for durable background processing, behind a queue abstraction.
- **Tailwind CSS v4 + Radix/shadcn primitives + Lucide** for an accessible,
  information-dense enterprise UI.
- **Zod** for validation at every trust boundary.

## Consequences

- A single domain layer (`src/domains/*`) is consumed identically by web, API,
  MCP, and workers — the "API-first / MCP-native" requirement is structural, not
  bolted on (see [ADR 0003](0003-centralised-authorisation.md)).
- Node runtime is required for storage SDKs, crypto, and streaming; Edge runtime
  is not assumed.
- Version pins in `package.json` are indicative; the lockfile is source of truth.
