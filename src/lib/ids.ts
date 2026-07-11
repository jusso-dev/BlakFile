/**
 * Identifier + correlation helpers. Correlation IDs thread a single logical
 * operation across web → domain → queue → worker → webhook so audit and logs
 * can be joined. Uses the Web Crypto API available in Node 22+ and Edge.
 */

/** A random UUIDv4. */
export function newId(): string {
  return crypto.randomUUID();
}

/** New correlation ID for an inbound request or job. */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Enumeration-resistant opaque token for share links, file requests, invitations.
 * 32 bytes of CSPRNG entropy, URL-safe base64 (no padding). Never sequential.
 */
export function newOpaqueToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

/**
 * Random object-storage key. Opaque — contains NO filename or tenant identifier
 * (see ADR 0002). A short shard prefix keeps object listings balanced.
 */
export function newStorageKey(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const key = base64UrlEncode(buf);
  return `${key.slice(0, 2)}/${key.slice(2)}`;
}

function base64UrlEncode(buf: Uint8Array): string {
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
