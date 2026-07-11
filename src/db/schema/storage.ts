import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";

/** A configured object-storage backend (S3/R2/Azure/GCS/MinIO/local). */
export const storageProviders = pgTable(
  "storage_providers",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    driver: text("driver").notNull(), // s3 | r2 | azure | gcs | minio | local
    region: text("region").notNull(),
    bucket: text("bucket").notNull(),
    endpoint: text("endpoint"), // custom endpoint for r2/minio/etc.
    credentialsRef: text("credentials_ref").notNull(), // KMS reference, NEVER plaintext
    isDefault: boolean("is_default").notNull().default(false),
    config: jsonb("config"), // provider-specific flexible metadata
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** External KMS key reference. Holds a pointer to key material, never the key. */
export const encryptionKeyReferences = pgTable(
  "encryption_key_references",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    kmsDriver: text("kms_driver").notNull(), // aws-kms | azure-kv | gcp-kms | vault
    keyRef: text("key_ref").notNull(), // external KMS key id/arn, not key material
    purpose: text("purpose").notNull(), // object | field | signing
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/**
 * A stored binary blob in a provider bucket. SECURITY: `objectKey` is a RANDOM
 * opaque key — it MUST NOT embed the filename, tenant id, or any user data.
 * Enumeration resistance and tenant isolation depend on this being unguessable.
 */
export const storageObjects = pgTable(
  "storage_objects",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    storageProviderId: uuid("storage_provider_id")
      .notNull()
      .references(() => storageProviders.id),
    objectKey: text("object_key").notNull(), // RANDOM opaque key — never filename/tenant
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    encryptionKeyId: uuid("encryption_key_id").references(
      () => encryptionKeyReferences.id,
    ),
    sseMode: text("sse_mode").notNull(), // sse-s3 | sse-kms | client
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.storageProviderId, t.objectKey),
  ],
);
