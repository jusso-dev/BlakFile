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
import { eq } from "drizzle-orm";
import { randomUUID, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import * as schema from "./schema";
import { hashSecret, credentialPrefix, sha256Hex } from "@/lib/crypto";
import { BUILT_IN_ROLES, PERMISSIONS } from "@/domains/authorisation";

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });
const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "BlakFileDemo2026!";

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
  apiKeyPlaintext?: string;
}): Promise<SeededOrg> {
  const [existingOrg] = await db
    .select({ id: schema.organisations.id })
    .from(schema.organisations)
    .where(eq(schema.organisations.slug, input.slug))
    .limit(1);

  if (existingOrg) {
    // A Docker Compose fixture volume can outlive its one-shot bootstrap
    // container. Treat a repeat setup as a safe no-op rather than duplicating
    // a tenant or reprinting an existing credential.
    return {
      id: existingOrg.id,
      slug: input.slug,
      roleIdByKey: new Map(),
      ownerUserId: "",
      memberUserId: "",
      apiKeyPlaintext: "(already seeded)",
    };
  }

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
    await db.insert(schema.accounts).values({
      userId,
      providerId: "credential",
      accountId: p.email.toLowerCase(),
      password: await hashPassword(demoPassword),
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

  // Representative records for the Northwind product workspace and screenshot
  // fixtures. Content is intentionally metadata-only: no patient or personal
  // data is used. The other seed tenant deliberately has a smaller staff
  // directory, so these records belong only to the Northwind fixture.
  if (input.slug === "northwind") {
    const now = new Date();
    await db.insert(schema.files).values([
    {
      organisationId: orgId,
      driveId: sharedDriveId,
      folderId: projectsId,
      name: "Regional Care Plan 2026.pdf",
      normalisedName: "regional care plan 2026.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2_480_000,
      ownerId: userIdByKey.get("records")!,
      status: "available",
      malwareStatus: "clean",
      processingStatus: "completed",
      previewStatus: "ready",
      sourceSystem: "records-management",
      dataResidency: "ap-southeast-2",
      createdAt: now,
      updatedAt: now,
    },
    {
      organisationId: orgId,
      driveId: sharedDriveId,
      folderId: projectsId,
      name: "Clinical Governance Review.docx",
      normalisedName: "clinical governance review.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 864_000,
      ownerId: userIdByKey.get("owner")!,
      status: "available",
      malwareStatus: "clean",
      processingStatus: "completed",
      previewStatus: "ready",
      sourceSystem: "blakfile",
      dataResidency: "ap-southeast-2",
      createdAt: now,
      updatedAt: now,
    },
    {
      organisationId: orgId,
      driveId: sharedDriveId,
      name: "Workforce Planning FY26.xlsx",
      normalisedName: "workforce planning fy26.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 412_000,
      ownerId: userIdByKey.get("security")!,
      status: "available",
      malwareStatus: "clean",
      processingStatus: "completed",
      previewStatus: "ready",
      sourceSystem: "planning",
      dataResidency: "ap-southeast-2",
      createdAt: now,
      updatedAt: now,
    },
    {
      organisationId: orgId,
      driveId: sharedDriveId,
      name: "Vendor Security Assessment.pdf",
      normalisedName: "vendor security assessment.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1_180_000,
      ownerId: userIdByKey.get("security")!,
      status: "restricted",
      malwareStatus: "clean",
      processingStatus: "completed",
      previewStatus: "ready",
      sourceSystem: "security",
      dataResidency: "ap-southeast-2",
      createdAt: now,
      updatedAt: now,
    },
    ]);
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
  const apiKeyPlaintext = input.apiKeyPlaintext ?? `bf_live_${randomBytes(24).toString("hex")}`;
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
    ...(process.env.SEED_API_KEY_NORTHWIND
      ? { apiKeyPlaintext: process.env.SEED_API_KEY_NORTHWIND }
      : {}),
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
    ...(process.env.SEED_API_KEY_SOUTHERNCROSS
      ? { apiKeyPlaintext: process.env.SEED_API_KEY_SOUTHERNCROSS }
      : {}),
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
