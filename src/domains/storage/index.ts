/**
 * Storage factory. Selects the driver from env. Domain services import
 * `getStorage()` — never a driver directly. Per-tenant provider overrides
 * (storageProviders rows) are resolved by a future org-scoped factory; the
 * default here serves the platform-default bucket.
 */
import { join } from "node:path";
import { env } from "@/lib/env";
import { S3Driver } from "./s3-driver";
import { LocalDriver } from "./local-driver";
import type { ObjectStorage } from "./types";

export * from "./types";
export { S3Driver } from "./s3-driver";
export { LocalDriver } from "./local-driver";

let cached: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (cached) return cached;
  cached = build();
  return cached;
}

function build(): ObjectStorage {
  if (env.STORAGE_DRIVER === "local") {
    return new LocalDriver({
      rootDir: join(process.cwd(), ".local-storage"),
      signingKey: env.KMS_LOCAL_MASTER_KEY ?? env.BETTER_AUTH_SECRET,
      signedUrlTtl: env.STORAGE_SIGNED_URL_TTL,
      baseUrl: env.APP_URL,
    });
  }
  // s3 | r2 | minio all use the S3 driver; azure/gcs drivers land in Phase 6.
  if (env.STORAGE_DRIVER === "azure" || env.STORAGE_DRIVER === "gcs") {
    throw new Error(`Storage driver '${env.STORAGE_DRIVER}' not yet implemented`);
  }
  return new S3Driver({
    driver: env.STORAGE_DRIVER === "r2" ? "r2" : env.STORAGE_ENDPOINT ? "minio" : "s3",
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    endpoint: env.STORAGE_ENDPOINT,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    signedUrlTtl: env.STORAGE_SIGNED_URL_TTL,
  });
}

/** Test seam: reset the memoised storage between tests. */
export function __resetStorage(): void {
  cached = null;
}
