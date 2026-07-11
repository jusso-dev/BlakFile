import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId, jobStatusEnum } from "./_shared";
import { organisations } from "./organisations";

/** Configured LLM/embedding provider. Secrets live in KMS via apiKeyRef only. */
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    // openai | azure-openai | anthropic | google | bedrock | ollama | local | custom
    driver: text("driver").notNull(),
    baseUrl: text("base_url"),
    apiKeyRef: text("api_key_ref"), // KMS reference; never a plaintext key
    region: text("region"),
    isHosted: boolean("is_hosted").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config"),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/**
 * Per-org AI governance. AI is OFF unless the org enables it, and content is
 * never sent to hosted providers unless allowHostedProviders is set.
 */
export const aiPolicies = pgTable(
  "ai_policies",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    allowHostedProviders: boolean("allow_hosted_providers")
      .notNull()
      .default(false),
    allowTraining: boolean("allow_training").notNull().default(false),
    allowedRegions: jsonb("allowed_regions"),
    defaultProviderId: uuid("default_provider_id"),
    excludeClassifications: jsonb("exclude_classifications"),
    promptRetentionDays: integer("prompt_retention_days"),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** A unit of AI work over a resource. Token usage recorded for billing/limits. */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    // summary | outline | entities | classify | translate | transcribe | embed | ask
    type: text("type").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    providerId: uuid("provider_id"),
    model: text("model"),
    promptTemplateVersion: text("prompt_template_version"),
    status: jobStatusEnum("status").notNull().default("queued"),
    requestedBy: uuid("requested_by").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    correlationId: uuid("correlation_id"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.organisationId, t.status),
  ],
);

/**
 * Output of an AI job. Ask-Your-Files answers cite their sources and respect
 * the org's prompt retention policy via retentionExpiresAt.
 */
export const aiOutputs = pgTable(
  "ai_outputs",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    aiJobId: uuid("ai_job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations"), // source fileVersionIds + locations
    model: text("model"),
    retentionExpiresAt: timestamp("retention_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index().on(t.organisationId)],
);
