/**
 * Database client. The application connects as the low-privilege `blakfile_app`
 * role (NOBYPASSRLS). Tenant isolation is enforced in the database by RLS
 * policies keyed on `app.current_org` — every request must open a transaction
 * that sets it. `withOrg()` is the ONLY sanctioned way to run tenant-scoped
 * queries; using the raw client for tenant data is a review failure.
 *
 * See docs/authorisation-model.md and docs/tenant-isolation.md.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://blakfile_app:blakfile@localhost:5432/blakfile";

// One shared pool. `prepare: false` keeps things simple with PgBouncer.
const client = postgres(connectionString, { max: 10, prepare: false });

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };

/**
 * Run a callback inside a transaction with the tenant context set so RLS
 * applies. `set_config(..., true)` scopes the setting to the transaction only,
 * so it cannot leak across pooled connections.
 */
export async function withOrg<T>(
  organisationId: string,
  fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_org', ${organisationId}, true)`,
    );
    return fn(tx);
  });
}
