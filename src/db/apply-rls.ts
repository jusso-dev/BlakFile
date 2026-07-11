/**
 * Applies src/db/rls.sql as the owner role (DATABASE_MIGRATION_URL). Run after
 * `db:migrate`. Idempotent — policies are dropped-if-exists then recreated.
 *
 *   npm run db:rls
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set");
  const sql = postgres(url, { max: 1 });
  try {
    const script = await readFile(join(process.cwd(), "src/db/rls.sql"), "utf8");
    await sql.unsafe(script);
    // eslint-disable-next-line no-console
    console.log("✓ RLS policies applied");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("RLS apply failed:", err);
  process.exit(1);
});
