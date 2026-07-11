/**
 * Authorisation domain types. The policy engine is a PURE function over these —
 * DB resolution of grants/attributes happens in the repository layer and is fed
 * in here, which keeps the security decision testable in isolation.
 *
 * See docs/authorisation-model.md.
 */

/** Assurance level of the caller's authentication (matches sessions.assuranceLevel). */
export type AssuranceLevel = "aal1" | "aal2" | "aal3";

/** Actions map 1:1 to permission catalogue keys. */
export type Action =
  | "file.read"
  | "file.preview"
  | "file.download"
  | "file.upload"
  | "file.share"
  | "file.share.public"
  | "file.share.external"
  | "file.delete"
  | "file.restore"
  | "file.permanent_delete"
  | "file.classify"
  | "file.legal_hold"
  | "file.ai"
  | "agent.run"
  | "apiCredential.create"
  | "audit.read"
  | "data.export";

/** High-risk actions require elevated assurance (step-up) by default. */
export const HIGH_RISK_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "file.permanent_delete",
  "file.legal_hold",
  "file.share.public",
  "apiCredential.create",
  "audit.read",
  "data.export",
]);

export type PrincipalType =
  | "user"
  | "service_account"
  | "api_client"
  | "agent"
  | "external_user"
  | "system";

/** Attributes used by ABAC rules. All optional — absent means "unknown". */
export interface PrincipalAttributes {
  employmentType?: "employee" | "contractor" | "guest";
  isGuest?: boolean;
  clearanceRank?: number;
  managedDevice?: boolean;
  deviceTrusted?: boolean;
  country?: string;
  ipTrusted?: boolean;
  sessionRisk?: "low" | "medium" | "high";
}

export interface Principal {
  type: PrincipalType;
  id: string;
  organisationId: string;
  /** Resolved RBAC permission keys (from roleAssignments + role permissions). */
  permissions: ReadonlySet<string>;
  attributes: PrincipalAttributes;
  isPlatformAdmin?: boolean;
  /**
   * For agent/service principals acting on behalf of a user: the agent may never
   * exceed the initiating user's permissions unless it is a separately authorised
   * service identity. When set, the engine intersects effective permissions.
   */
  onBehalfOf?: { id: string; permissions: ReadonlySet<string> } | undefined;
}

export type RetentionState = "active" | "due" | "disposed" | "held";

/** Resource attributes the engine evaluates. Populated by repositories. */
export interface ResourceAttributes {
  ownerId?: string;
  classificationRank?: number; // higher = more sensitive
  classificationName?: string;
  underLegalHold?: boolean;
  retentionState?: RetentionState;
  downloadRestricted?: boolean;
  watermarkRequired?: boolean;
  externalSharingAllowed?: boolean;
  dataResidency?: string;
  requiresManagedDevice?: boolean;
}

export interface ResourceRef {
  type: "file" | "folder" | "drive" | "workspace" | "share" | "organisation" | "audit";
  id: string;
  organisationId: string;
  attributes: ResourceAttributes;
}

export interface RequestContext {
  correlationId: string;
  assuranceLevel: AssuranceLevel;
  ip?: string;
  country?: string;
  /** ISO time; injected for deterministic time-of-day rules in tests. */
  now: Date;
}

export type Obligation =
  | { kind: "watermark" }
  | { kind: "step_up"; requiredAssurance: AssuranceLevel }
  | { kind: "require_managed_device" }
  | { kind: "log_reason" };

export interface Decision {
  allow: boolean;
  /** Machine reason code; safe to store in audit, never shown raw to end users. */
  reason: string;
  obligations: Obligation[];
}
