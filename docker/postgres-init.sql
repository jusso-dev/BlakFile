-- Runs once on first Postgres container init.
-- Extensions required by BlakFile. Migrations assume these exist.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS "vector";       -- pgvector: embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "citext";       -- case-insensitive email/domain

-- A lower-privilege role the application connects as. RLS applies to this role.
-- The migration role (default superuser in dev) bypasses RLS to run DDL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blakfile_app') THEN
    CREATE ROLE blakfile_app LOGIN PASSWORD 'blakfile' NOBYPASSRLS;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO blakfile_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blakfile_app;
