import { describe, it, expect } from "vitest";
import { canonical, computeHash, verifyChain, type AuditHashInput } from "./hash";

function ev(over: Partial<AuditHashInput> = {}): AuditHashInput {
  return {
    organisationId: "org-1",
    action: "file.read",
    outcome: "success",
    createdAt: "2026-07-11T00:00:00.000Z",
    ...over,
  };
}

describe("canonical", () => {
  it("is stable regardless of key order and omits nulls", () => {
    const a = canonical({ b: 1, a: 2, c: null });
    const b = canonical({ a: 2, b: 1 });
    expect(a).toBe(b);
  });
});

describe("hash chain", () => {
  it("links events; tampering breaks the chain", () => {
    const e1 = ev({ action: "file.upload" });
    const h1 = computeHash(null, e1);
    const e2 = ev({ action: "file.download" });
    const h2 = computeHash(h1, e2);

    const chain = [
      { ...e1, seq: 1, prevHash: null, hash: h1 },
      { ...e2, seq: 2, prevHash: h1, hash: h2 },
    ];
    expect(verifyChain(chain).ok).toBe(true);

    // Tamper with the first event's action.
    const tampered = [
      { ...e1, action: "file.delete", seq: 1, prevHash: null, hash: h1 },
      { ...e2, seq: 2, prevHash: h1, hash: h2 },
    ];
    const res = verifyChain(tampered);
    expect(res.ok).toBe(false);
    expect(res.brokenAtSeq).toBe(1);
  });

  it("detects a deleted (excised) middle event via prevHash mismatch", () => {
    const e1 = ev();
    const h1 = computeHash(null, e1);
    const e2 = ev({ action: "file.share" });
    const h2 = computeHash(h1, e2);
    const e3 = ev({ action: "file.delete" });
    const h3 = computeHash(h2, e3);

    // Remove e2 — e3 still points at h2 which no longer precedes it.
    const excised = [
      { ...e1, seq: 1, prevHash: null, hash: h1 },
      { ...e3, seq: 3, prevHash: h2, hash: h3 },
    ];
    const res = verifyChain(excised);
    expect(res.ok).toBe(false);
    expect(res.brokenAtSeq).toBe(3);
  });
});
