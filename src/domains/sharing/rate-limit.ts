import { createHash } from "node:crypto";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";

let redis: Redis | undefined;
const fallback = new Map<string, { count: number; resetAt: number }>();

function client(): Redis {
  redis ??= new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return redis;
}

function identifier(value: string): string {
  return createHash("sha256").update(value || "unknown").digest("hex").slice(0, 24);
}

async function increment(key: string, seconds: number): Promise<number> {
  try {
    const connection = client();
    if (connection.status === "wait") await connection.connect();
    const count = await connection.incr(key);
    if (count === 1) await connection.expire(key, seconds);
    return count;
  } catch {
    const now = Date.now();
    const current = fallback.get(key);
    const next = !current || current.resetAt <= now ? { count: 1, resetAt: now + seconds * 1000 }
      : { count: current.count + 1, resetAt: current.resetAt };
    fallback.set(key, next);
    return next.count;
  }
}

export async function enforceShareRateLimit(scope: "lookup" | "download", ip: string, resourceId?: string): Promise<number> {
  const limit = scope === "lookup" ? 60 : 60;
  const windowSeconds = scope === "lookup" ? 300 : 3600;
  const count = await increment(`share:${scope}:${identifier(ip)}:${resourceId ?? "global"}`, windowSeconds);
  if (count > limit) throw Errors.rateLimited("Too many share-link requests. Try again later.");
  return count;
}

export async function recordInvalidShareLookup(ip: string): Promise<void> {
  const count = await increment(`share:invalid:${identifier(ip)}`, 300);
  if (count > 20) throw Errors.rateLimited("Too many invalid share-link requests. Try again later.");
}

export async function takeInvalidShareLookupCount(ip: string): Promise<number> {
  const key = `share:invalid:${identifier(ip)}`;
  try {
    const connection = client();
    if (connection.status === "wait") await connection.connect();
    const value = await connection.getdel(key);
    return Number(value ?? 0);
  } catch {
    const current = fallback.get(key); fallback.delete(key);
    return current && current.resetAt > Date.now() ? current.count : 0;
  }
}
