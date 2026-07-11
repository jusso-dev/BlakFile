/**
 * Pluggable object-storage abstraction (ADR 0002). The domain layer depends ONLY
 * on this interface — never on a vendor SDK. Object keys are opaque and random;
 * signed URLs are short-lived and scope-limited; downloads are authorised before
 * a URL is ever minted.
 */

export interface PutUrl {
  url: string;
  /** Headers the client MUST send with the PUT (e.g. checksum, content-type). */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface MultipartInit {
  uploadId: string;
  key: string;
}

export interface PartUrl {
  partNumber: number;
  url: string;
  expiresInSeconds: number;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface GetUrlOptions {
  /** Force download vs inline; sets Content-Disposition. */
  disposition?: "inline" | "attachment";
  /** Suggested filename for attachment disposition (never the raw stored key). */
  filename?: string;
  contentType?: string;
}

export interface ObjectStorage {
  readonly driver: string;

  /** Presigned single-shot upload to a specific opaque key. */
  createUploadUrl(
    key: string,
    opts: { contentType?: string; checksumSha256?: string; maxBytes?: number },
  ): Promise<PutUrl>;

  createMultipartUpload(key: string, opts: { contentType?: string }): Promise<MultipartInit>;
  createPartUploadUrl(key: string, uploadId: string, partNumber: number): Promise<PartUrl>;
  completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<{ etag: string }>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /** Short-lived, scope-limited GET URL. Caller MUST authorise first. */
  getSignedDownloadUrl(key: string, opts?: GetUrlOptions): Promise<{ url: string; expiresInSeconds: number }>;

  /** Server-side stream (worker use: scanning, extraction). */
  getObjectStream(key: string): Promise<ReadableStream<Uint8Array>>;

  headObject(key: string): Promise<{ sizeBytes: number; etag?: string } | null>;
  deleteObject(key: string): Promise<void>;
  copyObject(sourceKey: string, destKey: string): Promise<void>;
}
