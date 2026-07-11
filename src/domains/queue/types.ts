/**
 * Durable job queue abstraction (ADR 0005). Domain code enqueues jobs through
 * this interface; the driver (BullMQ/Redis or Postgres) is selected by env.
 * Every job envelope carries organisationId + correlationId so workers stay
 * tenant-aware and traceable, and jobs are idempotent + retry-safe.
 */

/** Job types map to pipeline stages / background work (spec §7, §17). */
export type JobType =
  | "malware.scan"
  | "content.extract"
  | "preview.generate"
  | "ocr"
  | "search.index"
  | "ai.embed"
  | "retention.evaluate"
  | "legal_hold.apply"
  | "webhook.deliver"
  | "notification.dispatch"
  | "bulk.operation";

export interface JobEnvelope<T = Record<string, unknown>> {
  /** Idempotency key — re-enqueuing the same key must not double-process. */
  jobId: string;
  type: JobType;
  organisationId: string;
  correlationId: string;
  payload: T;
  attempts?: number;
}

export interface EnqueueOptions {
  /** De-duplicate by this key within the queue. */
  idempotencyKey?: string;
  delayMs?: number;
  maxAttempts?: number;
  priority?: number;
}

export type JobHandler = (env: JobEnvelope) => Promise<void>;

export interface Queue {
  readonly driver: string;
  enqueue<T>(env: Omit<JobEnvelope<T>, "jobId"> & { jobId?: string }, opts?: EnqueueOptions): Promise<string>;
  /** Register a handler for a job type (worker process). */
  process(type: JobType, handler: JobHandler): void;
  close(): Promise<void>;
}
