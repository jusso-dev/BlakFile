import { describe, it, expect } from "vitest";
import { authorize } from "./engine";
import { permissionsForRole } from "./roles";
import type { Action, Principal, RequestContext, ResourceRef } from "./types";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";

function principal(over: Partial<Principal> = {}): Principal {
  return {
    type: "user",
    id: "user-1",
    organisationId: ORG,
    permissions: permissionsForRole("member"),
    attributes: {},
    ...over,
  };
}

function resource(over: Partial<ResourceRef> = {}): ResourceRef {
  return {
    type: "file",
    id: "file-1",
    organisationId: ORG,
    attributes: {},
    ...over,
  };
}

function ctx(over: Partial<RequestContext> = {}): RequestContext {
  return {
    correlationId: "corr-1",
    assuranceLevel: "aal1",
    now: new Date("2026-07-11T00:00:00Z"),
    ...over,
  };
}

describe("tenant isolation", () => {
  it("denies cross-tenant access even with the permission", () => {
    const d = authorize(principal(), "file.read", resource({ organisationId: OTHER_ORG }), ctx());
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("cross_tenant_denied");
  });

  it("allows platform admin across tenants", () => {
    const p = principal({ isPlatformAdmin: true, permissions: new Set(["*"]) });
    const d = authorize(p, "file.read", resource({ organisationId: OTHER_ORG }), ctx());
    expect(d.allow).toBe(true);
  });
});

describe("RBAC", () => {
  it("denies when permission missing", () => {
    const p = principal({ permissions: permissionsForRole("guest") }); // no download
    const d = authorize(p, "file.download", resource(), ctx());
    expect(d.allow).toBe(false);
    expect(d.reason).toContain("missing_permission");
  });

  it("allows when permission present", () => {
    const d = authorize(principal(), "file.download", resource(), ctx());
    expect(d.allow).toBe(true);
  });
});

describe("legal hold (deny-overrides)", () => {
  const held = resource({ attributes: { underLegalHold: true } });

  it("blocks deletion under legal hold", () => {
    const p = principal({ permissions: new Set(["file.delete"]) });
    const d = authorize(p, "file.delete", held, ctx());
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("legal_hold_blocks_action");
  });

  it("still allows reading under legal hold", () => {
    const d = authorize(principal(), "file.read", held, ctx());
    expect(d.allow).toBe(true);
  });

  it("never permits permanent delete under legal hold even at aal3", () => {
    const p = principal({ permissions: new Set(["file.permanent_delete"]) });
    const d = authorize(p, "file.permanent_delete", held, ctx({ assuranceLevel: "aal3" }));
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("legal_hold_blocks_action");
  });
});

describe("ABAC obligations", () => {
  it("requires watermark for previewing restricted content", () => {
    const d = authorize(principal(), "file.preview", resource({ attributes: { classificationRank: 4 } }), ctx());
    expect(d.allow).toBe(true);
    expect(d.obligations).toContainEqual({ kind: "watermark" });
  });

  it("denies download when restricted without override", () => {
    const d = authorize(principal(), "file.download", resource({ attributes: { downloadRestricted: true } }), ctx());
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("download_restricted");
  });

  it("denies download from unmanaged device when resource requires managed", () => {
    const p = principal({ attributes: { managedDevice: false } });
    const d = authorize(p, "file.download", resource({ attributes: { requiresManagedDevice: true } }), ctx());
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("managed_device_required");
  });
});

describe("assurance / step-up", () => {
  it("requires aal2 step-up for public link at aal1", () => {
    const p = principal({ permissions: new Set(["file.share.public"]) });
    const d = authorize(p, "file.share.public", resource(), ctx({ assuranceLevel: "aal1" }));
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("step_up_required:aal2");
    expect(d.obligations).toContainEqual({ kind: "step_up", requiredAssurance: "aal2" });
  });

  it("requires aal3 for applying legal hold", () => {
    const p = principal({ permissions: new Set(["file.legal_hold"]) });
    const at2 = authorize(p, "file.legal_hold", resource(), ctx({ assuranceLevel: "aal2" }));
    expect(at2.allow).toBe(false);
    const at3 = authorize(p, "file.legal_hold", resource(), ctx({ assuranceLevel: "aal3" }));
    expect(at3.allow).toBe(true);
  });
});

describe("agent least-privilege", () => {
  it("agent cannot exceed the initiating user's permissions", () => {
    const agent = principal({
      type: "agent",
      permissions: new Set<Action>(["file.delete"]),
      onBehalfOf: { id: "user-9", permissions: new Set(["file.read"]) },
    });
    const d = authorize(agent, "file.delete", resource(), ctx());
    expect(d.allow).toBe(false); // intersection removes file.delete
    expect(d.reason).toContain("missing_permission");
  });
});

describe("guests & session risk", () => {
  it("blocks guests from high-risk actions", () => {
    const p = principal({ permissions: new Set(["data.export"]), attributes: { isGuest: true } });
    const d = authorize(p, "data.export", resource({ type: "organisation" }), ctx({ assuranceLevel: "aal3" }));
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("guest_high_risk_denied");
  });

  it("blocks high-risk actions on high session risk", () => {
    const p = principal({ permissions: new Set(["file.permanent_delete"]), attributes: { sessionRisk: "high" } });
    const d = authorize(p, "file.permanent_delete", resource(), ctx({ assuranceLevel: "aal3" }));
    expect(d.allow).toBe(false);
    expect(d.reason).toBe("high_session_risk");
  });
});
