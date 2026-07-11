# ADR 0002 — Pluggable object-storage abstraction

- Status: Accepted
- Date: 2026-07-11

## Context

The platform must not assume one storage provider. It must run against Amazon S3,
S3-compatible stores, Cloudflare R2, MinIO, Azure Blob, Google Cloud Storage,
local dev storage, and customer bring-your-own-bucket — including in air-gapped
deployments. File names and object locations are sensitive.

## Decision

Define an `ObjectStorage` interface in the `storage` domain; no domain code ever
imports a vendor SDK directly. Drivers (`s3`, `r2`, `azure`, `gcs`, `minio`,
`local`) implement it and are selected per `storageProviders` row (per org, so
different tenants can pin different regions/providers for data residency).

Interface surface: `createUploadUrl`, `createMultipartUpload`, `completeMultipart`,
`getSignedDownloadUrl`, `getObjectStream`, `deleteObject`, `copyObject`.

Rules baked into the abstraction:

- **Object keys are opaque random values** — never contain the file name, tenant
  identifier, or any guessable structure. The human name lives only in the
  `files`/`fileVersions` rows. (`storageObjects.objectKey`.)
- **Signed URLs are short-lived (120s default) and scope-limited**; downloads are
  authorised server-side *before* a URL is minted. No permanent storage URL is
  ever exposed.
- Provider credentials are stored as KMS references (`credentialsRef`), never as
  plaintext.

## Consequences

- Storage is swappable per tenant without touching domain logic.
- Data residency and per-tenant isolation are enforced at the storage layer via
  per-org bucket/prefix + region-pinned providers (see `docs/tenant-isolation.md`,
  `docs/storage-architecture.md`).
