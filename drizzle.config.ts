import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * Schema is split across domain modules under src/db/schema and re-exported
 * from src/db/schema/index.ts. Migrations are generated — never hand-edit the
 * database. Row-level security policies are applied via companion SQL migrations
 * in drizzle/ (see docs/authorisation-model.md).
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://blakfile:blakfile@localhost:5432/blakfile",
  },
  strict: true,
  verbose: true,
});
