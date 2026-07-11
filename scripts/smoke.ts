/**
 * End-to-end smoke test of the Phase 1 slice against a live DB + local storage.
 * Exercises the REAL domain services (not the HTTP layer): upload session →
 * simulate client PUT → complete (quarantine) → malware scan (none driver) →
 * download authorisation. Proves the pipeline moves a file quarantined→available
 * and that a signed URL is only minted after policy + scan pass.
 *
 * Run against the isolated verify DB with local storage:
 *   STORAGE_DRIVER=local MALWARE_DRIVER=none \
 *   DATABASE_URL=postgres://blakfile_app:blakfile@localhost:5433/blakfile \
 *   DATABASE_MIGRATION_URL=postgres://blakfile:blakfile@localhost:5433/blakfile \
 *   KMS_LOCAL_MASTER_KEY=dev-master-key-at-least-16-chars \
 *   npx tsx scripts/smoke.ts
 */
import { createHash } from "node:crypto";
import postgres from "postgres";
import { getStorage, LocalDriver } from "@/domains/storage";
import { runMalwareScan } from "@/domains/malware";
import { createUploadSession, completeUpload, getDownloadUrl } from "@/domains/files";
import { permissionsForRole } from "@/domains/authorisation";
import type { AppContext } from "@/lib/context";
import { newCorrelationId } from "@/lib/ids";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

async function main() {
  // Use the first seeded org + one of its drives.
  const owner = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
  const [org] = await owner<{ id: string }[]>`select id from organisations order by created_at limit 1`;
  const [drive] = await owner<{ id: string }[]>`select id from drives where organisation_id = ${org!.id} and type = 'shared' limit 1`;
  await owner.end();
  assert(org && drive, "seed data present");

  // Build a content_manager principal for the org (as the API layer would).
  const ctx: AppContext = {
    principal: {
      type: "api_client",
      id: "00000000-0000-0000-0000-0000000000aa",
      organisationId: org!.id,
      permissions: permissionsForRole("content_manager"),
      attributes: {},
    },
    request: { correlationId: newCorrelationId(), assuranceLevel: "aal1", now: new Date() },
  };

  const bytes = Buffer.from("BlakFile smoke test payload — not a real document.");
  const checksum = createHash("sha256").update(bytes).digest("hex");

  // 1. Create upload session.
  const session = await createUploadSession(ctx, {
    driveId: drive!.id,
    name: "smoke.txt",
    sizeBytes: bytes.length,
    mimeType: "text/plain",
    checksumSha256: checksum,
  });
  console.log("1. upload session:", session.uploadSessionId, "key:", session.objectKey);

  // 2. Simulate the client PUT by writing bytes straight to the local driver.
  const storage = getStorage();
  assert(storage instanceof LocalDriver, "using local storage driver");
  await storage.writeBytes(session.objectKey, bytes);
  console.log("2. bytes written to storage");

  // 3. Complete → file created, quarantined.
  const completed = await completeUpload(ctx, { uploadSessionId: session.uploadSessionId, checksumSha256: checksum }, session.objectKey);
  assert(completed.status === "quarantined", `expected quarantined, got ${completed.status}`);
  console.log("3. completed:", completed.fileId, "status:", completed.status);

  // 3a. Download must be BLOCKED while quarantined.
  let blocked = false;
  try {
    await getDownloadUrl(ctx, completed.fileId);
  } catch (e) {
    blocked = true;
    console.log("3a. download correctly blocked while quarantined:", (e as Error).message);
  }
  assert(blocked, "download blocked pre-scan");

  // 4. Run the malware scan stage (none driver → clean → available).
  await runMalwareScan(org!.id, ctx.request.correlationId, {
    fileId: completed.fileId,
    versionId: completed.versionId,
    objectKey: session.objectKey,
  });
  console.log("4. scan complete");

  // 5. Download now authorised → signed URL.
  const dl = await getDownloadUrl(ctx, completed.fileId);
  assert(dl.url.includes("/api/v1/_local/"), "signed local URL minted");
  console.log("5. download url:", dl.url.slice(0, 80) + "...", "ttl:", dl.expiresInSeconds);

  console.log("\n✓ SMOKE PASSED — upload → quarantine → scan → available → download");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
