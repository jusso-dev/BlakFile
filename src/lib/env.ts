/**
 * Validated environment configuration. Import `env` — never read process.env
 * directly elsewhere. Fails fast at startup if required config is missing or
 * malformed, so a misconfigured deployment cannot boot into an insecure state.
 */
import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16),

  DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url().optional(),

  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  QUEUE_DRIVER: z.enum(["bullmq", "pg"]).default("bullmq"),
  CACHE_DRIVER: z.enum(["redis", "memory"]).default("redis"),

  STORAGE_DRIVER: z.enum(["s3", "r2", "azure", "gcs", "local"]).default("s3"),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default("ap-southeast-2"),
  STORAGE_BUCKET: z.string().default("blakfile-dev"),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: bool.default("true"),
  STORAGE_SIGNED_URL_TTL: z.coerce.number().int().positive().max(3600).default(120),

  KMS_DRIVER: z.enum(["local", "aws-kms", "azure-kv", "gcp-kms", "vault"]).default("local"),
  KMS_LOCAL_MASTER_KEY: z.string().min(16).optional(),

  AI_ENABLED: bool.default("false"),
  AI_DRIVER: z
    .enum(["ollama", "openai", "azure-openai", "anthropic", "google", "bedrock", "disabled"])
    .default("ollama"),
  AI_BASE_URL: z.string().url().optional(),
  AI_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  AI_CHAT_MODEL: z.string().default("llama3.1"),
  AI_ALLOW_HOSTED_PROVIDERS: bool.default("false"),

  MALWARE_DRIVER: z.enum(["clamav", "none", "vendor"]).default("clamav"),
  CLAMAV_HOST: z.string().default("localhost"),
  CLAMAV_PORT: z.coerce.number().int().default(3310),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DEFAULT_DATA_RESIDENCY: z.string().default("ap-southeast-2"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Do not print values — only which keys failed.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration. Check: ${keys}`);
  }
  return parsed.data;
}

export const env = load();
export const isProd = env.NODE_ENV === "production";
