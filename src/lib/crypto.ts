/**
 * Cryptographic helpers. We use Node's `crypto` + well-maintained libraries —
 * NEVER hand-rolled primitives (spec §19). These cover: hashing opaque secrets
 * for storage (API keys, share-link passwords lookups), constant-time compare,
 * and content checksums.
 *
 * Password hashing for user accounts is handled by Better Auth, not here.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/** SHA-256 hex of a buffer/string — content checksums, hash-chain input. */
export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Hash a bearer secret (API key / SCIM token / webhook secret lookup) for at-rest
 * storage. We store only this hash; the plaintext is shown once at creation.
 * Uses SHA-256 with a per-secret salt encoded into the output.
 */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(secret, salt, 32);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const actual = scryptSync(secret, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Constant-time equality for two hex/utf8 strings of equal expected length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** HMAC-SHA256 hex — webhook payload signatures. Key comes from KMS, not here. */
export function hmacSha256Hex(key: string | Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** Non-secret display prefix for a credential, e.g. "bf_live_a1b2". */
export function credentialPrefix(plaintext: string): string {
  return plaintext.slice(0, 12);
}
