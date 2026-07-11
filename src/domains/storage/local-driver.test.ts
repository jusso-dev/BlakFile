import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { LocalDriver } from "./local-driver";
import { newStorageKey } from "@/lib/ids";

const ROOT = join(process.cwd(), ".local-storage-test");

function driver() {
  return new LocalDriver({
    rootDir: ROOT,
    signingKey: "test-signing-key",
    signedUrlTtl: 120,
    baseUrl: "http://localhost:3000",
  });
}

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe("object keys", () => {
  it("are opaque: no filename, no tenant, sharded", () => {
    const key = newStorageKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{2}\/[A-Za-z0-9_-]+$/);
    expect(key).not.toContain(".");
  });
});

describe("local driver round-trip", () => {
  it("writes then reads bytes", async () => {
    const d = driver();
    const key = newStorageKey();
    await d.writeBytes(key, Buffer.from("hello blakfile"));
    const head = await d.headObject(key);
    expect(head?.sizeBytes).toBe(14);
    expect((await d.readBytes(key)).toString()).toBe("hello blakfile");
  });

  it("emulates multipart upload", async () => {
    const d = driver();
    const key = newStorageKey();
    const { uploadId } = await d.createMultipartUpload(key);
    await d.writeBytes(`${key}.parts/${uploadId}.1`, Buffer.from("part1"));
    await d.writeBytes(`${key}.parts/${uploadId}.2`, Buffer.from("part2"));
    await d.completeMultipartUpload(key, uploadId, [
      { partNumber: 2, etag: "b" },
      { partNumber: 1, etag: "a" },
    ]);
    expect((await d.readBytes(key)).toString()).toBe("part1part2");
  });
});

describe("signed URLs", () => {
  it("verifies a fresh signature and rejects tampering/expiry", () => {
    const d = driver();
    const key = "ab/opaque";
    const exp = Date.now() + 60_000;
    // reproduce the internal signature via a get URL round-trip
    const sig = (d as unknown as { sign(op: string, k: string, e: number): string }).sign("get", key, exp);
    expect(d.verify("get", key, exp, sig)).toBe(true);
    expect(d.verify("get", key, exp, "deadbeef")).toBe(false);
    expect(d.verify("get", key, Date.now() - 1, sig)).toBe(false);
  });
});

describe("path traversal defence", () => {
  it("refuses keys that escape the root", async () => {
    const d = driver();
    await expect(d.readBytes("../../etc/passwd")).rejects.toThrow(/traversal/);
  });
});
