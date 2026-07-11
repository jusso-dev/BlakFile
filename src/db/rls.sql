-- =============================================================================
-- BlakFile — Row-Level Security policies (ADR 0004, docs/tenant-isolation.md)
--
-- Applied AFTER the Drizzle migration by `npm run db:rls`, as the owner role.
-- Enables tenant isolation on every table carrying an organisation_id, keyed on
-- the transaction-local setting `app.current_org` that `withOrg()` sets.
--
-- The application connects as `blakfile_app` (NOBYPASSRLS), so a forgotten
-- WHERE clause still fails closed. Owner/migration connections bypass RLS.
-- =============================================================================

-- 1. Ensure the app role can operate on all current tables.
GRANT USAGE ON SCHEMA public TO blakfile_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blakfile_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blakfile_app;

-- 2. Enable RLS + a tenant-isolation policy on every table with organisation_id.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organisation_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);

    -- current_setting(..., true) returns NULL when unset → comparison yields no
    -- rows, so an un-scoped connection sees nothing (fail closed).
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON public.%I
      USING (organisation_id = current_setting('app.current_org', true)::uuid)
      WITH CHECK (organisation_id = current_setting('app.current_org', true)::uuid)
    $p$, r.table_name);
  END LOOP;
END $$;

-- 3. Audit log is append-only at the DATABASE level: the app role may INSERT and
--    SELECT but never UPDATE or DELETE (belt-and-braces beside the hash chain).
REVOKE UPDATE, DELETE ON public.audit_events FROM blakfile_app;

-- 4. Default privileges so future migrated tables are usable by the app role
--    without re-running the grants above (owner runs migrations).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blakfile_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO blakfile_app;
