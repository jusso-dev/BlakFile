/**
 * BullMQ (Redis) queue driver. One BullMQ queue per job type, namespaced with a
 * "blakfile:" prefix. The org id lives in the job payload and is validated by the
 * handler on dequeue (tenant isolation at the queue layer).
 */
import { Queue as BullQueue, Worker, type ConnectionOptions } from "bullmq";
import { newId } from "@/lib/ids";
import type { EnqueueOptions, JobEnvelope, JobHandler, JobType, Queue } from "./types";

export class BullMqQueue implements Queue {
  readonly driver = "bullmq";
  private readonly connection: ConnectionOptions;
  private readonly queues = new Map<JobType, BullQueue>();
  private readonly workers: Worker[] = [];

  constructor(redisUrl: string) {
    const u = new URL(redisUrl);
    this.connection = {
      host: u.hostname,
      port: Number(u.port || 6379),
      ...(u.password ? { password: u.password } : {}),
    };
  }

  private queueFor(type: JobType): BullQueue {
    let q = this.queues.get(type);
    if (!q) {
      q = new BullQueue(type, { connection: this.connection, prefix: "blakfile" });
      this.queues.set(type, q);
    }
    return q;
  }

  async enqueue<T>(
    env: Omit<JobEnvelope<T>, "jobId"> & { jobId?: string },
    opts: EnqueueOptions = {},
  ): Promise<string> {
    const jobId = env.jobId ?? opts.idempotencyKey ?? newId();
    const q = this.queueFor(env.type);
    await q.add(
      env.type,
      { ...env, jobId } satisfies JobEnvelope<T>,
      {
        jobId, // BullMQ de-dupes by jobId — idempotent enqueue
        attempts: opts.maxAttempts ?? 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
        ...(opts.delayMs ? { delay: opts.delayMs } : {}),
        ...(opts.priority ? { priority: opts.priority } : {}),
      },
    );
    return jobId;
  }

  process(type: JobType, handler: JobHandler): void {
    const worker = new Worker(
      type,
      async (job) => handler(job.data as JobEnvelope),
      { connection: this.connection, prefix: "blakfile" },
    );
    this.workers.push(worker);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
