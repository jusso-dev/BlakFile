/**
 * The central authorisation engine. PURE and deny-overrides: any rule that
 * denies wins, regardless of RBAC grants. Obligations (watermark, step-up,
 * managed device) are collected and MUST be honoured by the caller.
 *
 * Order of evaluation:
 *   1. Tenant isolation   — principal.org must equal resource.org (or platform admin)
 *   2. RBAC               — principal must hold the permission for the action
 *   3. ABAC rules         — attribute-based denies + obligations (deny-overrides)
 *   4. Assurance          — high-risk actions require step-up
 *
 * See docs/authorisation-model.md.
 */
import {
  type Action,
  type Decision,
  type Obligation,
  type Principal,
  type RequestContext,
  type ResourceRef,
  HIGH_RISK_ACTIONS,
} from "./types";

/** Actions permitted even while a resource is under legal hold (non-mutating). */
const LEGAL_HOLD_SAFE: ReadonlySet<Action> = new Set<Action>([
  "file.read",
  "file.preview",
  "file.download",
  "file.classify", // reclassifying up is allowed; deletion is not
  "audit.read",
  "data.export",
]);

const ASSURANCE_ORDER = { aal1: 1, aal2: 2, aal3: 3 } as const;

function assuranceMeets(have: RequestContext["assuranceLevel"], need: "aal2" | "aal3"): boolean {
  return ASSURANCE_ORDER[have] >= ASSURANCE_ORDER[need];
}

/** Effective permissions: an on-behalf-of agent cannot exceed the initiating user. */
function effectivePermissions(p: Principal): ReadonlySet<string> {
  if (!p.onBehalfOf) return p.permissions;
  const intersection = new Set<string>();
  for (const perm of p.permissions) {
    if (p.onBehalfOf.permissions.has(perm)) intersection.add(perm);
  }
  return intersection;
}

function deny(reason: string): Decision {
  return { allow: false, reason, obligations: [] };
}

export function authorize(
  principal: Principal,
  action: Action,
  resource: ResourceRef,
  ctx: RequestContext,
): Decision {
  const obligations: Obligation[] = [];

  // 1. Tenant isolation. Platform admins may cross tenants (audited elsewhere).
  if (!principal.isPlatformAdmin && principal.organisationId !== resource.organisationId) {
    return deny("cross_tenant_denied");
  }

  // 2. RBAC. Permission key equals the action; also honour a coarse "*" grant.
  const perms = effectivePermissions(principal);
  if (!principal.isPlatformAdmin && !perms.has(action) && !perms.has("*")) {
    return deny(`missing_permission:${action}`);
  }

  const a = resource.attributes;

  // 3. ABAC — deny-overrides.

  // 3a. Legal hold blocks mutation/deletion regardless of RBAC.
  if (a.underLegalHold && !LEGAL_HOLD_SAFE.has(action)) {
    return deny("legal_hold_blocks_action");
  }

  // 3b. Retention: disposed content is gone; held behaves like legal hold.
  if (a.retentionState === "disposed") {
    return deny("resource_disposed");
  }
  if (a.retentionState === "held" && !LEGAL_HOLD_SAFE.has(action)) {
    return deny("retention_hold_blocks_action");
  }

  // 3c. Download restriction on the resource.
  if (action === "file.download" && a.downloadRestricted && !perms.has("file.download.override")) {
    return deny("download_restricted");
  }

  // 3d. Managed-device requirement for sensitive resources on download/share.
  const sensitiveAction =
    action === "file.download" || action.startsWith("file.share");
  if (sensitiveAction && a.requiresManagedDevice) {
    if (principal.attributes.managedDevice === true) {
      // satisfied
    } else if (principal.attributes.managedDevice === false) {
      return deny("managed_device_required");
    } else {
      obligations.push({ kind: "require_managed_device" });
    }
  }

  // 3e. External sharing must be allowed on the resource.
  if (action === "file.share.external" && a.externalSharingAllowed === false) {
    return deny("external_sharing_disabled");
  }

  // 3f. Guests cannot perform destructive or governance actions.
  if (principal.attributes.isGuest && HIGH_RISK_ACTIONS.has(action)) {
    return deny("guest_high_risk_denied");
  }

  // 3g. High session risk blocks high-risk actions outright.
  if (principal.attributes.sessionRisk === "high" && HIGH_RISK_ACTIONS.has(action)) {
    return deny("high_session_risk");
  }

  // 3h. Watermark obligation for previews/downloads of sensitive content.
  if (
    (action === "file.preview" || action === "file.download") &&
    (a.watermarkRequired || (a.classificationRank ?? 0) >= 3)
  ) {
    obligations.push({ kind: "watermark" });
  }

  // 4. Assurance / step-up for high-risk actions.
  if (HIGH_RISK_ACTIONS.has(action)) {
    const need = action === "file.permanent_delete" || action === "file.legal_hold" ? "aal3" : "aal2";
    if (!assuranceMeets(ctx.assuranceLevel, need)) {
      obligations.push({ kind: "step_up", requiredAssurance: need });
      obligations.push({ kind: "log_reason" });
      return { allow: false, reason: `step_up_required:${need}`, obligations };
    }
  }

  return { allow: true, reason: "allowed", obligations };
}
