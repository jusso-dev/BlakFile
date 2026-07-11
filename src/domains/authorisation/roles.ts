/**
 * Built-in role + permission catalogue (spec §5). These seed the `roles`,
 * `permissions`, and (per-org) default `roleAssignments`. `organisationId = null`
 * roles are system-defined and cannot be edited by tenants.
 *
 * Permission keys mirror `Action` values plus finer-grained grants.
 */

export const PERMISSIONS = [
  { key: "file.read", category: "files", name: "Read files" },
  { key: "file.preview", category: "files", name: "Preview files" },
  { key: "file.download", category: "files", name: "Download files" },
  { key: "file.download.override", category: "files", name: "Override download restriction" },
  { key: "file.upload", category: "files", name: "Upload files" },
  { key: "file.share", category: "sharing", name: "Share files" },
  { key: "file.share.public", category: "sharing", name: "Create public links" },
  { key: "file.share.external", category: "sharing", name: "Invite external users" },
  { key: "file.delete", category: "files", name: "Delete files" },
  { key: "file.restore", category: "files", name: "Restore files" },
  { key: "file.permanent_delete", category: "files", name: "Permanently delete files" },
  { key: "file.classify", category: "governance", name: "Modify classification" },
  { key: "file.legal_hold", category: "governance", name: "Apply legal hold" },
  { key: "file.ai", category: "ai", name: "Use AI with files" },
  { key: "agent.run", category: "agents", name: "Run agent actions" },
  { key: "apiCredential.create", category: "admin", name: "Create API credentials" },
  { key: "audit.read", category: "admin", name: "Access audit logs" },
  { key: "data.export", category: "admin", name: "Export data" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

const ALL: PermissionKey[] = PERMISSIONS.map((p) => p.key);

const READER: PermissionKey[] = ["file.read", "file.preview"];
const CONTRIBUTOR: PermissionKey[] = [
  ...READER,
  "file.download",
  "file.upload",
  "file.share",
  "file.ai",
];

export interface BuiltInRole {
  key: string;
  name: string;
  isSystem: true;
  /** "*" means all permissions (platform/owner scope). */
  permissions: PermissionKey[] | ["*"];
}

export const BUILT_IN_ROLES: BuiltInRole[] = [
  { key: "platform_super_admin", name: "Platform super administrator", isSystem: true, permissions: ["*"] },
  { key: "org_owner", name: "Organisation owner", isSystem: true, permissions: ["*"] },
  { key: "org_admin", name: "Organisation administrator", isSystem: true, permissions: ALL.filter((p) => p !== "file.permanent_delete") },
  { key: "security_admin", name: "Security administrator", isSystem: true, permissions: ["audit.read", "file.classify", "file.legal_hold", ...READER] },
  { key: "identity_admin", name: "Identity administrator", isSystem: true, permissions: ["apiCredential.create"] },
  { key: "compliance_admin", name: "Compliance administrator", isSystem: true, permissions: ["audit.read", "data.export", "file.legal_hold", "file.classify", ...READER] },
  { key: "records_manager", name: "Records manager", isSystem: true, permissions: ["file.classify", "file.legal_hold", "file.restore", ...READER] },
  { key: "legal_hold_admin", name: "Legal hold administrator", isSystem: true, permissions: ["file.legal_hold", "audit.read", ...READER] },
  { key: "auditor", name: "Auditor", isSystem: true, permissions: ["audit.read", ...READER] },
  { key: "content_manager", name: "Content manager", isSystem: true, permissions: [...CONTRIBUTOR, "file.delete", "file.restore", "file.classify", "file.share.external"] },
  { key: "member", name: "Standard member", isSystem: true, permissions: [...CONTRIBUTOR, "file.delete", "file.restore"] },
  { key: "restricted_member", name: "Restricted member", isSystem: true, permissions: [...READER, "file.download"] },
  { key: "guest", name: "Guest", isSystem: true, permissions: READER },
  { key: "external_collaborator", name: "External collaborator", isSystem: true, permissions: [...READER, "file.upload"] },
  { key: "service_account", name: "Service account", isSystem: true, permissions: [] },
  { key: "agent_identity", name: "AI agent identity", isSystem: true, permissions: ["file.read", "file.preview", "agent.run"] },
];

export function permissionsForRole(key: string): ReadonlySet<string> {
  const role = BUILT_IN_ROLES.find((r) => r.key === key);
  if (!role) return new Set();
  if (role.permissions[0] === "*") return new Set(["*"]);
  return new Set(role.permissions);
}
