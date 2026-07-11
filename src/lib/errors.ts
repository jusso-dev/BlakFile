/**
 * Typed domain errors. Every expected failure has a stable `code` so API/MCP
 * layers can map it to a status without leaking internals. Security failures
 * (Denied, NotFound-as-hidden) are first-class — never a generic Error.
 */
export type ErrorCode =
  | "unauthenticated"
  | "denied"
  | "not_found"
  | "validation"
  | "conflict"
  | "quota_exceeded"
  | "rate_limited"
  | "legal_hold"
  | "malware_detected"
  | "precondition_failed"
  | "unavailable"
  | "internal";

export class DomainError extends Error {
  readonly code: ErrorCode;
  /** Safe, non-sensitive detail for API responses. */
  readonly publicMessage: string;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    publicMessage: string,
    opts?: { cause?: unknown; meta?: Record<string, unknown> },
  ) {
    super(publicMessage, opts?.cause ? { cause: opts.cause } : undefined);
    this.name = "DomainError";
    this.code = code;
    this.publicMessage = publicMessage;
    if (opts?.meta) this.meta = opts.meta;
  }
}

export const Errors = {
  unauthenticated: (m = "Authentication required") =>
    new DomainError("unauthenticated", m),
  /**
   * Access denied. `reason` is captured for audit but the public message stays
   * generic to avoid leaking which resources exist (IDOR/enumeration defence).
   */
  denied: (reason: string) =>
    new DomainError("denied", "You do not have access to this resource.", {
      meta: { reason },
    }),
  /** Prefer returning `denied`-as-not-found to hide existence from unauthorised callers. */
  notFound: (m = "Not found") => new DomainError("not_found", m),
  validation: (m: string, meta?: Record<string, unknown>) =>
    new DomainError("validation", m, meta ? { meta } : undefined),
  conflict: (m: string) => new DomainError("conflict", m),
  quota: (m = "Storage quota exceeded") => new DomainError("quota_exceeded", m),
  rateLimited: (m = "Rate limit exceeded") => new DomainError("rate_limited", m),
  legalHold: (m = "Blocked: resource is under legal hold") =>
    new DomainError("legal_hold", m),
  malware: (m = "Blocked: file failed malware scanning") =>
    new DomainError("malware_detected", m),
  precondition: (m: string) => new DomainError("precondition_failed", m),
  unavailable: (m = "Service temporarily unavailable") =>
    new DomainError("unavailable", m),
  internal: (m = "Internal error", cause?: unknown) =>
    new DomainError("internal", m, cause ? { cause } : undefined),
} as const;

/** Map a domain error code to an HTTP status for the REST/MCP layers. */
export function statusForCode(code: ErrorCode): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "denied":
      return 403;
    case "not_found":
      return 404;
    case "validation":
      return 422;
    case "conflict":
      return 409;
    case "quota_exceeded":
    case "legal_hold":
    case "malware_detected":
    case "precondition_failed":
      return 412;
    case "rate_limited":
      return 429;
    case "unavailable":
      return 503;
    default:
      return 500;
  }
}
