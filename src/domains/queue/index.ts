/**
 * Queue factory. `getQueue()` returns the configured driver. A Postgres-backed
 * driver (QUEUE_DRIVER=pg) for Redis-free/air-gapped installs lands alongside the
 * `processingJobs` table; until then only BullMQ is wired.
 */
import { env } from "@/lib/env";
import { BullMqQueue } from "./bullmq-driver";
import type { Queue } from "./types";

export * from "./types";
export { BullMqQueue } from "./bullmq-driver";

let cached: Queue | null = null;

export function getQueue(): Queue {
  if (cached) return cached;
  if (env.QUEUE_DRIVER === "pg") {
    throw new Error("Postgres queue driver not yet implemented — set QUEUE_DRIVER=bullmq");
  }
  cached = new BullMqQueue(env.REDIS_URL);
  return cached;
}
