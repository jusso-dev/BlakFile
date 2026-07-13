/**
 * Background worker process. Consumes the durable job queue and runs pipeline
 * stages via the shared domain services — the SAME code the web/API call. Each
 * job carries organisationId + correlationId; handlers stay tenant-scoped through
 * withOrg. Handlers are idempotent and safe to retry.
 *
 *   npm run worker
 */
import { getQueue, type JobEnvelope } from "@/domains/queue";
import { runMalwareScan, type ScanJobPayload } from "@/domains/malware";
import { logger } from "@/lib/logger";
import { runTrackedProcessingJob, runContentProcessing, type ContentJobPayload } from "@/domains/processing";

function tracked(env: JobEnvelope, handler: () => Promise<void>): Promise<void> {
  return runTrackedProcessingJob(env.organisationId, (env.payload as { processingJobId?: string }).processingJobId, handler);
}

async function handleMalwareScan(env: JobEnvelope): Promise<void> {
  const payload = env.payload as unknown as ScanJobPayload;
  await runMalwareScan(env.organisationId, env.correlationId, payload);
}

function main(): void {
  const queue = getQueue();

  queue.process("malware.scan", async (env) => {
    logger.info({ jobId: env.jobId, org: env.organisationId, correlationId: env.correlationId }, "malware.scan started");
    await tracked(env, () => handleMalwareScan(env));
  });

  queue.process("content.extract", async (env) => {
    logger.info({ jobId: env.jobId, org: env.organisationId, correlationId: env.correlationId }, "content.extract started");
    await tracked(env, () => runContentProcessing(env.organisationId, env.correlationId, env.payload as unknown as ContentJobPayload));
  });

  logger.info({ driver: queue.driver }, "BlakFile worker started; processing: malware.scan, content.extract");

  // Phase 4 stages (content.extract, preview.generate, ocr, search.index,
  // ai.embed) and Phase 6 (retention.evaluate, legal_hold.apply) register here.

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    try {
      await queue.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main();
