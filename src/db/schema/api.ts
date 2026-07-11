import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, orgId } from "./_shared";
import { organisations } from "./organisations";

/** An API integration principal: PAT, OAuth app, or service integration. */
export const apiClients = pgTable(
  "api_clients",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    type: text("type").notNull(), // personal_access | oauth | service
    ownerId: uuid("owner_id"),
    scopes: jsonb("scopes").notNull(),
    allowedIpRanges: jsonb("allowed_ip_ranges"),
    enabled: boolean("enabled").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** Issued API key. Stored hashed — NEVER plaintext; `prefix` is display-only. */
export const apiCredentials = pgTable(
  "api_credentials",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    apiClientId: uuid("api_client_id")
      .notNull()
      .references(() => apiClients.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(), // hashed secret, NEVER stored in plaintext
    prefix: text("prefix").notNull(), // non-secret display prefix
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotatedFrom: uuid("rotated_from"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.apiClientId)],
);

/** Non-human principal that can hold its own authorisation independent of a user. */
export const serviceAccounts = pgTable(
  "service_accounts",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    roleId: uuid("role_id"),
    allowedScopes: jsonb("allowed_scopes").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    credentialRef: text("credential_ref"), // KMS ref; never plaintext
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** Registered OAuth2 client. Client secret stored hashed, never plaintext. */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    clientId: text("client_id").notNull(),
    clientSecretHash: text("client_secret_hash").notNull(), // hashed, never plaintext
    redirectUris: jsonb("redirect_uris").notNull(),
    grantTypes: jsonb("grant_types").notNull(),
    scopes: jsonb("scopes").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index().on(t.organisationId),
    uniqueIndex().on(t.clientId),
  ],
);
