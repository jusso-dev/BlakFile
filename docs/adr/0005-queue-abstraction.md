# ADR 0005 — Durable job system behind a queue abstraction

- Status: Accepted
- Date: 2026-07-11

## Context

File processing, malware scanning, OCR, preview generation, metadata extraction,
AI indexing, search indexing, retention enforcement, legal-hold processing, bulk
operations, notifications, and webhook delivery all need durable, retry-safe
background execution. Deployments vary (Redis available, or Postgres-only, or a
cloud queue).

## Decision

- Define a `Queue` abstraction; the default driver is **BullMQ on Redis**, with a
  **PostgreSQL-backed** driver for Redis-free/air-gapped installs. Selected via
  `QUEUE_DRIVER`.
- Every job is mirrored by a durable **`processingJobs`** row (status, attempts,
  `maxAttempts`, `correlationId`, payload, error). Jobs are **idempotent and
  retry-safe** — re-running a completed stage is a no-op.
- Workers are a separate process (`npm run worker`) sharing the same domain layer.
- Failure handling: exponential backoff, dead-letter, and (for webhooks) manual
  replay.

## Consequences

- The upload pipeline (`docs/upload-pipeline.md`) is a chain of durable jobs; a
  file stays quarantined until mandatory security stages pass.
- Switching to a cloud queue later is a new driver, not a domain rewrite.
- Job payloads carry `organisationId`, validated on dequeue (tenant isolation).
