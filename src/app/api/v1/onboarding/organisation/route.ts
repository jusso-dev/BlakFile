import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { authDb, schema } from "@/db";
import { BUILT_IN_ROLES } from "@/domains/authorisation";
import { errorResponse, json } from "@/lib/http";

const bodySchema = z.object({ name: z.string().trim().min(2).max(120) });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return json({ error: { code: "unauthenticated", message: "Sign in required" } }, { status: 401 });
    const { name } = bodySchema.parse(await req.json());
    const suffix = randomUUID().slice(0, 8);
    const slug = `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48)}-${suffix}`;
    const organisationId = randomUUID();
    const roles = BUILT_IN_ROLES.map((role) => ({ id: randomUUID(), organisationId, key: role.key, name: role.name, isSystem: true }));
    const ownerRole = roles.find((role) => role.key === "org_owner");
    if (!ownerRole) throw new Error("Owner role missing");
    await authDb.transaction(async (tx) => {
      await tx.insert(schema.organisations).values({ id: organisationId, name, slug, status: "active", dataResidency: "ap-southeast-2", planTier: "enterprise" });
      await tx.insert(schema.organisationMembers).values({ organisationId, userId: session.user.id, status: "active", employmentType: "employee", joinedAt: new Date() });
      await tx.insert(schema.roles).values(roles);
      await tx.insert(schema.roleAssignments).values({ organisationId, roleId: ownerRole.id, principalType: "user", principalId: session.user.id, scopeType: "organisation", scopeId: null, grantedBy: session.user.id });
    });
    return json({ organisationId, slug }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
