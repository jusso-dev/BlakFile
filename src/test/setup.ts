/**
 * Vitest global setup. Provides safe test-only environment so modules that load
 * `env` at import time work. No real services are contacted by unit tests.
 */
const e = process.env as Record<string, string | undefined>;
e["NODE_ENV"] ??= "test";
e["BETTER_AUTH_SECRET"] ??= "test-secret-at-least-16-chars-long";
e["DATABASE_URL"] ??= "postgres://blakfile:blakfile@localhost:5432/blakfile_test";
e["STORAGE_ACCESS_KEY_ID"] ??= "test";
e["STORAGE_SECRET_ACCESS_KEY"] ??= "test";
e["KMS_LOCAL_MASTER_KEY"] ??= "test-master-key-at-least-16-chars";
e["LOG_LEVEL"] ??= "error";
