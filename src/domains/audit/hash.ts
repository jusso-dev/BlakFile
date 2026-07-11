/**
 * Canonical serialisation + hash-chain computation for audit events. Pure and
 * dependency-free so it is trivially testable and identical on write and verify.
 *
 * hash = SHA-256( prevHash || canonical(event) )
 *
 * Canonical form: JSON with sorted keys, stable field set, nulls omitted. Any
 * change to a persisted event changes its hash and breaks every subsequent link.
 */
import { sha256Hex } from "@/lib/crypto";

/**
 * The subset of an audit event covered by the hash. Note `seq` is NOT included:
 * it is assigned by the database at insert time, and chain order is already
 * bound by the `prevHash` pointer. `seq` is used only for retrieval ordering.
 */
export interface AuditHashInput {
  organisationId: string;
  action: string;
  outcome: string;
  actorType?: string | null;
  actorId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceVersion?: string | null;
  correlationId?: string | null;
  createdAt: string; // ISO 8601
  metadata?: Record<string, unknown> | null;
}

/** Deterministic JSON with recursively sorted keys and omitted null/undefined. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(sortValue);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[key];
      if (val === undefined || val === null) continue;
      out[key] = sortValue(val);
    }
    return out;
  }
  return v;
}

export function computeHash(prevHash: string | null, event: AuditHashInput): string {
  return sha256Hex((prevHash ?? "") + canonical(event));
}

/**
 * Verify a contiguous, seq-ordered slice of one org's chain. Returns the seq of
 * the first broken link, or null if the whole slice is intact.
 */
export function verifyChain(
  events: Array<AuditHashInput & { seq: number; prevHash: string | null; hash: string | null }>,
): { ok: boolean; brokenAtSeq: number | null } {
  let prev: string | null = events.length > 0 ? events[0]!.prevHash : null;
  for (const e of events) {
    if (e.prevHash !== prev) return { ok: false, brokenAtSeq: e.seq };
    const expected = computeHash(e.prevHash, stripChainFields(e));
    if (expected !== e.hash) return { ok: false, brokenAtSeq: e.seq };
    prev = e.hash;
  }
  return { ok: true, brokenAtSeq: null };
}

function stripChainFields(
  e: AuditHashInput & { seq: number; prevHash: string | null; hash: string | null },
): AuditHashInput {
  const { seq: _s, prevHash: _p, hash: _h, ...rest } = e;
  return rest;
}
