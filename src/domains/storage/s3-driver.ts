/**
 * S3-compatible storage driver (AWS S3, R2, MinIO). Uses the AWS SDK v3 with the
 * S3 request presigner. The same driver serves all S3-API providers via endpoint
 * + forcePathStyle config, so R2/MinIO need no separate driver.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CompletedPart,
  GetUrlOptions,
  MultipartInit,
  ObjectStorage,
  PartUrl,
  PutUrl,
} from "./types";

export interface S3DriverConfig {
  driver: "s3" | "r2" | "minio";
  region: string;
  bucket: string;
  endpoint?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  signedUrlTtl: number;
}

export class S3Driver implements ObjectStorage {
  readonly driver: string;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly ttl: number;

  constructor(cfg: S3DriverConfig) {
    this.driver = cfg.driver;
    this.bucket = cfg.bucket;
    this.ttl = cfg.signedUrlTtl;
    this.client = new S3Client({
      region: cfg.region,
      ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async createUploadUrl(
    key: string,
    opts: { contentType?: string; checksumSha256?: string },
  ): Promise<PutUrl> {
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["content-type"] = opts.contentType;
    // Bind the upload to the client-declared SHA-256 so a mismatched body is
    // rejected by S3 itself (defence in depth alongside our own verification).
    if (opts.checksumSha256) headers["x-amz-checksum-sha256"] = opts.checksumSha256;
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      ChecksumSHA256: opts.checksumSha256,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.ttl });
    return { url, headers, expiresInSeconds: this.ttl };
  }

  async createMultipartUpload(key: string, opts: { contentType?: string }): Promise<MultipartInit> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType }),
    );
    if (!res.UploadId) throw new Error("S3 did not return an UploadId");
    return { uploadId: res.UploadId, key };
  }

  async createPartUploadUrl(key: string, uploadId: string, partNumber: number): Promise<PartUrl> {
    const cmd = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.ttl });
    return { partNumber, url, expiresInSeconds: this.ttl };
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<{ etag: string }> {
    const res = await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
    return { etag: res.ETag ?? "" };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }

  async getSignedDownloadUrl(
    key: string,
    opts: GetUrlOptions = {},
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const disposition = opts.disposition ?? "attachment";
    // Filename is set from DB metadata, never derived from the opaque key.
    const cd = opts.filename
      ? `${disposition}; filename="${sanitiseFilename(opts.filename)}"`
      : disposition;
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: cd,
      ResponseContentType: opts.contentType,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.ttl });
    return { url, expiresInSeconds: this.ttl };
  }

  async getObjectStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("Empty object body");
    return res.Body.transformToWebStream();
  }

  async headObject(key: string): Promise<{ sizeBytes: number; etag?: string } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: res.ContentLength ?? 0, ...(res.ETag ? { etag: res.ETag } : {}) };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
      }),
    );
  }
}

/** Strip CR/LF/quote to prevent header injection into Content-Disposition. */
function sanitiseFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, "_");
}
