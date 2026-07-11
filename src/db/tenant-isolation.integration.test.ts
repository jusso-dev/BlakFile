/**
 * Multi-tenant isolation integration test (spec §1 testing, §4). Proves RLS at
 * the database layer: the app role sees nothing without a tenant context and only
 * its own tenant's rows with one. Requires a migrated + seeded database and the
 * app-role DATABASE_URL. Gated behind INTEGRATION_DB so the default unit run stays
 * infra-free.
 *
 *   INTEGRATION_DB=1 DATABASE_URL=postgres://blakfile_app:blakfile@localhost:5433/blakfile \
 *     DATABASE_MIGRATION_URL=postgres://blakfile:blakfile@localhost:5433/blakfile \
 *     npx vitest run src/db/tenant-isolation.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const run = process.env.INTEGRATION_DB ? describe : describe.skip;

run("tenant isolation (RLS)", () => {
  const appUrl = process.env.DATABASE_URL!;
  const ownerUrl = process.env.DATABASE_MIGRATION_URL ?? appUrl;
  let app: ReturnType<typeof postgres>;
  let owner: ReturnType<typeof postgres>;
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    app = postgres(appUrl, { max: 1 });
    owner = postgres(ownerUrl, { max: 1 });
    const orgs = await owner<{ id: string }[]>`select id from organisations order by created_at limit 2`;
    orgA = orgs[0]!.id;
    orgB = orgs[1]!.id;
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it("owner sees both tenants", async () => {
    const rows = await owner<{ count: string }[]>`select count(*)::text from organisations`;
    expect(Number(rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });

  it("app role WITHOUT a tenant context sees nothing (fail closed)", async () => {
    const rows = await app<{ count: string }[]>`select count(*)::text from classifications`;
    expect(Number(rows[0]!.count)).toBe(0);
  });

  it("app role scoped to org A sees only org A rows", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.current_org', ${orgA}, true)`;
      return tx<{ organisation_id: string }[]>`select organisation_id from classifications`;
    });
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.organisation_id === orgA)).toBe(true);
  });

  it("app role scoped to org A cannot read org B rows even when named explicitly", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.current_org', ${orgA}, true)`;
      return tx<{ n: string }[]>`select count(*)::text as n from classifications where organisation_id = ${orgB}`;
    });
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("audit log is append-only for the app role (UPDATE/DELETE denied)", async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.current_org', ${orgA}, true)`;
        await tx`delete from audit_events`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
