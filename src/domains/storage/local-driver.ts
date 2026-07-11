/**
 * Local filesystem storage driver for development and air-gapped installs.
 * There is no cloud presigner, so "signed URLs" are short-lived HMAC-signed
 * relative URLs served by the app's local-storage route handler. The HMAC keeps
 * the same security property: a URL is unforgeable and expires quickly.
 *
 * NOT for production multi-node deployments — use S3/MinIO there.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, rm, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { hmacSha256Hex } from "@/lib/crypto";
import type {
  CompletedPart,
  GetUrlOptions,
  MultipartInit,
  ObjectStorage,
  PartUrl,
  PutUrl,
} from "./types";

export interface LocalDriverConfig {
  rootDir: string;
  /** HMAC key for signing local URLs (dev master key reference). */
  signingKey: string;
  signedUrlTtl: number;
  baseUrl: string;
}

export class LocalDriver implements ObjectStorage {
  readonly driver = "local";
  private readonly root: string;
  private readonly key: string;
  private readonly ttl: number;
  private readonly baseUrl: string;

  constructor(cfg: LocalDriverConfig) {
    this.root = resolve(cfg.rootDir);
    this.key = cfg.signingKey;
    this.ttl = cfg.signedUrlTtl;
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
  }

  /** Resolve a key to an absolute path, refusing traversal outside root. */
  private pathFor(objectKey: string): string {
    const p = resolve(join(this.root, objectKey));
    if (p !== this.root && !p.startsWith(this.root + "/")) {
      throw new Error("path traversal detected in object key");
    }
    return p;
  }

  private sign(op: "put" | "get", objectKey: string, expiresAt: number): string {
    return hmacSha256Hex(this.key, `${op}:${objectKey}:${expiresAt}`);
  }

  verify(op: "put" | "get", objectKey: string, expiresAt: number, sig: string): boolean {
    if (Date.now() > expiresAt) return false;
    const expected = this.sign(op, objectKey, expiresAt);
    return expected === sig;
  }

  private urlFor(op: "put" | "get", objectKey: string, extra: Record<string, string> = {}): string {
    const expiresAt = Date.now() + this.ttl * 1000;
    const sig = this.sign(op, objectKey, expiresAt);
    const q = new URLSearchParams({ op, exp: String(expiresAt), sig, ...extra });
    return `${this.baseUrl}/api/v1/_local/${encodeURIComponent(objectKey)}?${q.toString()}`;
  }

  async createUploadUrl(key: string): Promise<PutUrl> {
    return { url: this.urlFor("put", key), headers: {}, expiresInSeconds: this.ttl };
  }

  // Multipart is emulated: each part is a file; complete concatenates them.
  async createMultipartUpload(key: string): Promise<MultipartInit> {
    return { uploadId: `local-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`, key };
  }

  async createPartUploadUrl(key: string, uploadId: string, partNumber: number): Promise<PartUrl> {
    return {
      partNumber,
      url: this.urlFor("put", `${key}.parts/${uploadId}.${partNumber}`),
      expiresInSeconds: this.ttl,
    };
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<{ etag: string }> {
    const chunks: Buffer[] = [];
    for (const p of parts.sort((a, b) => a.partNumber - b.partNumber)) {
      chunks.push(await readFile(this.pathFor(`${key}.parts/${uploadId}.${p.partNumber}`)));
    }
    const full = Buffer.concat(chunks);
    await this.writeBytes(key, full);
    await rm(this.pathFor(`${key}.parts`), { recursive: true, force: true });
    return { etag: createHash("md5").update(full).digest("hex") };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await rm(this.pathFor(`${key}.parts`), { recursive: true, force: true }).catch(() => {});
    void uploadId;
  }

  async getSignedDownloadUrl(
    key: string,
    opts: GetUrlOptions = {},
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const extra: Record<string, string> = {};
    if (opts.filename) extra["filename"] = opts.filename;
    if (opts.disposition) extra["disposition"] = opts.disposition;
    return { url: this.urlFor("get", key, extra), expiresInSeconds: this.ttl };
  }

  async writeBytes(key: string, data: Buffer): Promise<void> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async readBytes(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async getObjectStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const data = await readFile(this.pathFor(key));
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });
  }

  async headObject(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const s = await stat(this.pathFor(key));
      return { sizeBytes: s.size };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const dest = this.pathFor(destKey);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(this.pathFor(sourceKey), dest);
  }
}
