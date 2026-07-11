/**
 * Development seed. Creates TWO fully isolated organisations to demonstrate
 * tenant separation, with realistic roles, members, drives, folders,
 * classifications, a service API client, and a short audit chain.
 *
 * Runs as the OWNER role (DATABASE_MIGRATION_URL) so it can populate both tenants
 * (bypassing RLS). Contains NO real secrets or personal information.
 *
 *   npm run db:seed
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { randomUUID, randomBytes } from "node:crypto";
import * as schema from "./schema";
import { hashSecret, credentialPrefix, sha256Hex } from "@/lib/crypto";
import { BUILT_IN_ROLES, PERMISSIONS } from "@/domains/authorisation";

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

const CLASSES = [
  { name: "Public", rank: 0, colour: "#16a34a", rules: {} },
  { name: "Internal", rank: 1, colour: "#2563eb", rules: {} },
  { name: "Confidential", rank: 2, colour: "#d97706", rules: { externalSharingAllowed: false } },
  { name: "Restricted", rank: 3, colour: "#dc2626", rules: { watermarkRequired: true, externalSharingAllowed: false } },
  { name: "Highly Restricted", rank: 4, colour: "#7f1d1d", rules: { watermarkRequired: true, downloadRestricted: true, requiresManagedDevice: true, externalSharingAllowed: false } },
];

interface SeededOrg {
  id: string;
  slug: string;
  roleIdByKey: Map<string, string>;
  ownerUserId: string;
  memberUserId: string;
  apiKeyPlaintext: string;
}

async function seedOrg(input: {
  name: string;
  slug: string;
  people: { key: string; email: string; name: string; role: string; employmentType?: string }[];
}): Promise<SeededOrg> {
  const orgId = randomUUID();
  await db.insert(schema.organisations).values({
    id: orgId,
    name: input.name,
    slug: input.slug,
    status: "active",
    dataResidency: "ap-southeast-2",
    planTier: "enterprise",
  });

  await db.insert(schema.organisationDomains).values({
    organisationId: orgId,
    domain: `${input.slug}.example`,
    verified: true,
    isPrimary: true,
    verifiedAt: new Date(),
  });

  // Built-in roles for this tenant.
  const roleIdByKey = new Map<string, string>();
  for (const r of BUILT_IN_ROLES) {
    const id = randomUUID();
    roleIdByKey.set(r.key, id);
    await db.insert(schema.roles).values({
      id,
      organisationId: orgId,
      key: r.key,
      name: r.name,
      isSystem: true,
    });
  }

  // People + memberships + role assignments.
  const userIdByKey = new Map<string, string>();
  for (const p of input.people) {
    const userId = randomUUID();
    userIdByKey.set(p.key, userId);
    await db.insert(schema.users).values({
      id: userId,
      email: p.email.toLowerCase(),
      emailVerified: true,
      name: p.name,
      status: "active",
    });
    await db.insert(schema.organisationMembers).values({
      organisationId: orgId,
      userId,
      status: "active",
      employmentType: p.employmentType ?? "employee",
      joinedAt: new Date(),
    });
    const roleId = roleIdByKey.get(p.role)!;
    await db.insert(schema.roleAssignments).values({
      organisationId: orgId,
      roleId,
      principalType: "user",
      principalId: userId,
      scopeType: "organisation",
      scopeId: null,
    });
  }

  // Default storage provider (dev MinIO). Credentials are a KMS reference only.
  await db.insert(schema.storageProviders).values({
    organisationId: orgId,
    name: "Default (MinIO dev)",
    driver: "minio",
    region: "ap-southeast-2",
    bucket: "blakfile-dev",
    endpoint: "http://localhost:9000",
    credentialsRef: "kms://local/dev-storage",
    isDefault: true,
  });

  // Drives: a shared team drive + a personal drive for the owner.
  const sharedDriveId = randomUUID();
  await db.insert(schema.drives).values({
    id: sharedDriveId,
    organisationId: orgId,
    name: "Shared",
    type: "shared",
    dataResidency: "ap-southeast-2",
    quotaBytes: 100 * 1024 ** 3,
  });
  await db.insert(schema.drives).values({
    organisationId: orgId,
    name: "My Files",
    type: "personal",
    ownerId: userIdByKey.get("owner")!,
    dataResidency: "ap-southeast-2",
  });

  // A couple of folders under the shared drive (materialised paths).
  const projectsId = randomUUID();
  await db.insert(schema.folders).values({
    id: projectsId,
    organisationId: orgId,
    driveId: sharedDriveId,
    name: "Projects",
    path: "/Projects/",
    depth: 1,
    createdBy: userIdByKey.get("owner")!,
  });
  await db.insert(schema.folders).values({
    organisationId: orgId,
    driveId: sharedDriveId,
    parentFolderId: projectsId,
    name: "2026",
    path: "/Projects/2026/",
    depth: 2,
    createdBy: userIdByKey.get("owner")!,
  });

  // Classifications.
  for (const c of CLASSES) {
    await db.insert(schema.classifications).values({
      organisationId: orgId,
      name: c.name,
      colour: c.colour,
      rank: c.rank,
      handlingRules: c.rules,
    });
  }

  // Service API client + credential. The plaintext key is shown ONCE here.
  const apiClientId = randomUUID();
  await db.insert(schema.apiClients).values({
    id: apiClientId,
    organisationId: orgId,
    name: "Seed automation client",
    type: "service",
    scopes: ["file.read", "file.upload", "file.download"],
    enabled: true,
  });
  const apiKeyPlaintext = `bf_live_${randomBytes(24).toString("hex")}`;
  await db.insert(schema.apiCredentials).values({
    organisationId: orgId,
    apiClientId,
    keyHash: hashSecret(apiKeyPlaintext),
    prefix: credentialPrefix(apiKeyPlaintext),
  });
  // Grant the API client the content_manager role so it can exercise the slice.
  await db.insert(schema.roleAssignments).values({
    organisationId: orgId,
    roleId: roleIdByKey.get("content_manager")!,
    principalType: "api_client",
    principalId: apiClientId,
    scopeType: "organisation",
    scopeId: null,
  });

  // Short append-only audit chain (2 events) to demonstrate the hash chain.
  let prevHash: string | null = null;
  for (const action of ["organisation.member.created", "security.policy.changed"]) {
    const createdAt = new Date();
    const canonicalBody = JSON.stringify({ action, organisationId: orgId, outcome: "success" });
    const hash = sha256Hex((prevHash ?? "") + canonicalBody);
    await db.insert(schema.auditEvents).values({
      organisationId: orgId,
      action,
      outcome: "success",
      actorType: "system",
      correlationId: randomUUID(),
      prevHash,
      hash,
      createdAt,
    });
    prevHash = hash;
  }

  return {
    id: orgId,
    slug: input.slug,
    roleIdByKey,
    ownerUserId: userIdByKey.get("owner")!,
    memberUserId: userIdByKey.get("member")!,
    apiKeyPlaintext,
  };
}

async function main() {
  // Seed the global permission catalogue once.
  for (const p of PERMISSIONS) {
    await db
      .insert(schema.permissions)
      .values({ key: p.key, name: p.name, category: p.category })
      .onConflictDoNothing();
  }

  const orgA = await seedOrg({
    name: "Northwind Regional Health",
    slug: "northwind",
    people: [
      { key: "owner", email: "owner@northwind.example", name: "Alex Owner", role: "org_owner" },
      { key: "security", email: "security@northwind.example", name: "Sam Security", role: "security_admin" },
      { key: "records", email: "records@northwind.example", name: "Robin Records", role: "records_manager" },
      { key: "member", email: "member@northwind.example", name: "Morgan Member", role: "member" },
      { key: "guest", email: "guest@northwind.example", name: "Casey Guest", role: "guest", employmentType: "guest" },
    ],
  });

  const orgB = await seedOrg({
    name: "Southern Cross Legal",
    slug: "southerncross",
    people: [
      { key: "owner", email: "owner@southerncross.example", name: "Jordan Owner", role: "org_owner" },
      { key: "member", email: "member@southerncross.example", name: "Riley Member", role: "member" },
      { key: "guest", email: "guest@southerncross.example", name: "Drew Guest", role: "guest", employmentType: "contractor" },
    ],
  });

  // eslint-disable-next-line no-console
  console.log(`
✓ Seed complete — two isolated organisations created.

  Org A: Northwind Regional Health   (${orgA.id})
    API key: ${orgA.apiKeyPlaintext}
  Org B: Southern Cross Legal         (${orgB.id})
    API key: ${orgB.apiKeyPlaintext}

  Use a key as:  Authorization: Bearer <key>
  These keys are shown ONCE. They authorise the content_manager role in their org.
`);
  await sql.end();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await sql.end();
  process.exit(1);
});
