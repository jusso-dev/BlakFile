/** Live proof that BullMQ + the worker completes both durable pipeline stages. */
import { createHash } from "node:crypto";
import postgres from "postgres";
import { createUploadSession, completeUpload, getFileDetail } from "@/domains/files";
import { permissionsForRole } from "@/domains/authorisation";
import { newCorrelationId } from "@/lib/ids";
import type { AppContext } from "@/lib/context";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`WORKER SMOKE FAIL: ${message}`);
}

async function main() {
  const owner = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
  const [org] = await owner<{ id: string }[]>`select id from organisations order by created_at limit 1`;
  const [drive] = await owner<{ id: string }[]>`select id from drives where organisation_id = ${org!.id} and type = 'shared' limit 1`;
  assert(org && drive, "seed data present");
  const ctx: AppContext = { principal: { type: "api_client", id: "00000000-0000-0000-0000-0000000000aa",
    organisationId: org.id, permissions: permissionsForRole("content_manager"), attributes: {} },
    request: { correlationId: newCorrelationId(), assuranceLevel: "aal1", now: new Date() } };
  const bytes = Buffer.from(`worker-smoke-${Date.now()}`); const checksum = createHash("sha256").update(bytes).digest("hex");
  const session = await createUploadSession(ctx, { driveId: drive.id, name: "worker-smoke.txt", sizeBytes: bytes.length,
    mimeType: "text/plain", checksumSha256: checksum });
  const put = await fetch(session.upload.url, { method: "PUT", headers: session.upload.headers, body: bytes });
  assert(put.ok, "storage PUT succeeded");
  const completed = await completeUpload(ctx, { uploadSessionId: session.uploadSessionId, checksumSha256: checksum }, session.objectKey);
  let detail = await getFileDetail(ctx, completed.fileId);
  const deadline = Date.now() + 15_000;
  while (detail.status !== "available" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    detail = await getFileDetail(ctx, completed.fileId);
  }
  assert(detail.status === "available" && detail.malwareStatus === "clean" && detail.processingStatus === "completed",
    `worker reached available/clean/completed (got ${detail.status}/${detail.malwareStatus}/${detail.processingStatus})`);
  const jobs = await owner<{ type: string; status: string }[]>`select type, status from processing_jobs
    where resource_id = ${completed.versionId} order by created_at`;
  assert(jobs.some((job) => job.type === "malware.scan" && job.status === "completed"), "durable malware job completed");
  assert(jobs.some((job) => job.type === "content.extract" && job.status === "completed"), "durable content job completed");
  await owner.end();
  console.log("✓ WORKER SMOKE PASSED — durable malware.scan → content.extract → available");
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
