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
import { runMalwareScan } from "@/domains/malware";
import { runContentProcessing, runTrackedProcessingJob } from "@/domains/processing";
import { createUploadSession, completeUpload, getDownloadUrl } from "@/domains/files";
import { getShareLinkAccess, getShareLinkDownload } from "@/domains/sharing/share-link-access";
import { createShare } from "@/domains/sharing";
import { getFileDetail } from "@/domains/files";
import type { MalwareScanner, ScanResult } from "@/domains/malware";
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
  const put = await fetch(session.upload.url, { method: "PUT", headers: session.upload.headers, body: bytes });
  assert(put.ok, `storage accepted upload (${put.status})`);
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
  await runContentProcessing(org!.id, ctx.request.correlationId, {
    fileId: completed.fileId, versionId: completed.versionId, processingJobId: completed.processingJobId,
  });
  console.log("4. scan and content processing complete");

  // 5. Download now authorised → signed URL.
  const dl = await getDownloadUrl(ctx, completed.fileId);
  assert(dl.url.startsWith("http"), "signed download URL minted");
  console.log("5. download url:", dl.url.slice(0, 80) + "...", "ttl:", dl.expiresInSeconds);

  // 6. Existing share links follow the logical file's current version.
  const share = await createShare(ctx, completed.fileId, { permissionLevel: "downloader", createLink: true,
    downloadEnabled: true, requireAuth: false });
  assert(share.link?.url, "share link created through domain service");
  const token = new URL(share.link.url).pathname.split("/").pop()!;

  // 6a. Policy controls fail closed and one-time consumption is atomic.
  const controlled = await createShare(ctx, completed.fileId, { permissionLevel: "viewer", createLink: true,
    requireAuth: false, password: "correct-horse-battery", oneTime: true, maxAccessCount: 1,
    allowedIpRanges: ["203.0.113.0/24"], allowedCountries: ["AU"] });
  const controlledToken = new URL(controlled.link!.url!).pathname.split("/").pop()!;
  const controlledHeaders = new Headers({ "x-forwarded-for": "203.0.113.42", "x-country-code": "AU" });
  const passwordGate = await getShareLinkAccess(controlledToken, controlledHeaders);
  assert(passwordGate.passwordRequired, "password-protected link withholds file metadata");
  controlledHeaders.set("x-share-password", "correct-horse-battery");
  const allowed = await getShareLinkAccess(controlledToken, controlledHeaders);
  assert(allowed.file?.id === completed.fileId, "password, IP and country policy grants matching request");
  let consumed = false; try { await getShareLinkAccess(controlledToken, controlledHeaders); } catch { consumed = true; }
  assert(consumed, "one-time link cannot be reused");

  const atomic = await createShare(ctx, completed.fileId, { permissionLevel: "downloader", createLink: true,
    requireAuth: false, downloadEnabled: true, maxAccessCount: 1 });
  const atomicToken = new URL(atomic.link!.url!).pathname.split("/").pop()!;
  const atomicResults = await Promise.allSettled([getShareLinkDownload(atomicToken, new Headers()), getShareLinkDownload(atomicToken, new Headers())]);
  assert(atomicResults.filter((result) => result.status === "fulfilled").length === 1,
    "concurrent max-access link consumption permits exactly one request");

  // 7. Two uploads created from the same base version race. Advisory locking
  // serialises completion and the stored baseVersionId rejects the stale loser.
  const versionBytes = [Buffer.from("concurrent version A"), Buffer.from("concurrent version B")];
  const versionSessions = await Promise.all(versionBytes.map(async (content, index) => {
    const digest = createHash("sha256").update(content).digest("hex");
    const candidate = await createUploadSession(ctx, { driveId: drive.id, fileId: completed.fileId,
      name: `smoke-v2-${index}.txt`, sizeBytes: content.length, mimeType: "text/plain", checksumSha256: digest });
    const response = await fetch(candidate.upload.url, { method: "PUT", headers: candidate.upload.headers, body: content });
    assert(response.ok, `concurrent storage upload ${index} succeeded`);
    return { ...candidate, digest };
  }));
  const outcomes = await Promise.allSettled(versionSessions.map((candidate) => completeUpload(ctx,
    { uploadSessionId: candidate.uploadSessionId, checksumSha256: candidate.digest }, candidate.objectKey)));
  const winners = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof completeUpload>>> => outcome.status === "fulfilled");
  const losers = outcomes.filter((outcome) => outcome.status === "rejected");
  assert(winners.length === 1 && losers.length === 1, "exactly one concurrent version wins");
  const winner = winners[0]!.value;
  assert((losers[0] as PromiseRejectedResult).reason?.code === "conflict", "stale completion rejected with conflict");
  await runMalwareScan(org.id, ctx.request.correlationId, { fileId: winner.fileId, versionId: winner.versionId,
    objectKey: versionSessions[outcomes.findIndex((outcome) => outcome.status === "fulfilled")]!.objectKey });
  await runContentProcessing(org.id, ctx.request.correlationId,
    { fileId: winner.fileId, versionId: winner.versionId, processingJobId: winner.processingJobId });

  const versions = await owner<{ id: string; version_number: number; is_current: boolean }[]>`
    select id, version_number, is_current from file_versions where file_id = ${completed.fileId} order by version_number`;
  assert(versions.length === 2 && versions[1]!.version_number === 2 && versions[1]!.is_current, "version sequence and current pointer are atomic");
  const losingIndex = outcomes.findIndex((outcome) => outcome.status === "rejected");
  const residue = await owner<{ count: string }[]>`select count(*)::text as count from storage_objects where object_key = ${versionSessions[losingIndex]!.objectKey}`;
  assert(Number(residue[0]!.count) === 0, "stale completion transaction rolled back without storage metadata residue");

  await getShareLinkDownload(token, new Headers());
  const [access] = await owner<{ file_version_id: string }[]>`select file_version_id from share_access_events where share_id = ${share.id} order by created_at desc limit 1`;
  assert(access?.file_version_id === winner.versionId, "existing share link resolves to the new current version");

  // 8. Deterministic fixture scanners exercise infected, suspicious, and
  // scanner-error fail-closed paths through the real domain service.
  async function verdictCase(verdict: ScanResult["verdict"], shouldThrow = false) {
    const content = Buffer.from(`fixture-${verdict}`); const digest = createHash("sha256").update(content).digest("hex");
    const candidate = await createUploadSession(ctx, { driveId: drive!.id, name: `${verdict}.txt`, sizeBytes: content.length,
      mimeType: "text/plain", checksumSha256: digest });
    const response = await fetch(candidate.upload.url, { method: "PUT", headers: candidate.upload.headers, body: content });
    assert(response.ok, `${verdict} fixture uploaded`);
    const file = await completeUpload(ctx, { uploadSessionId: candidate.uploadSessionId, checksumSha256: digest }, candidate.objectKey);
    const scanner: MalwareScanner = { engine: "deterministic-fixture", scanStream: async () => {
      if (shouldThrow) throw new Error("fixture_scanner_error");
      return { verdict, engine: "deterministic-fixture", durationMs: 1, ...(verdict !== "clean" ? { signature: `fixture-${verdict}` } : {}) };
    } };
    try { await runTrackedProcessingJob(org!.id, file.processingJobId, () => runMalwareScan(org!.id, ctx.request.correlationId,
      { fileId: file.fileId, versionId: file.versionId, objectKey: candidate.objectKey }, { scanner })); }
    catch (error) { if (!shouldThrow) throw error; }
    const detail = await getFileDetail(ctx, file.fileId);
    assert(detail.status !== "available", `${verdict} result remains unavailable`);
    let denied = false; try { await getDownloadUrl(ctx, file.fileId); } catch { denied = true; }
    assert(denied, `${verdict} result cannot be downloaded`);
    const [job] = await owner<{ status: string }[]>`select status from processing_jobs where id = ${file.processingJobId}`;
    assert(job?.status === (shouldThrow ? "failed" : "completed"), `${verdict} durable job terminal state recorded`);
  }
  await verdictCase("infected"); await verdictCase("suspicious"); await verdictCase("error", true);
  console.log("7. infected, suspicious, and scanner-error fixtures verified fail-closed");
  await owner.end();
  console.log("6. concurrency, rollback safety, and share-link current-version policy verified");

  console.log("\n✓ SMOKE PASSED — upload → quarantine → scan → processing → available → download");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
