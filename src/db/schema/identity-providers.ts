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

/**
 * Per-org SSO identity provider. attributeMapping/groupMapping/roleMapping are
 * provider-specific JSONB translating IdP claims to BlakFile principals/roles.
 */
export const identityProviders = pgTable(
  "identity_providers",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(), // saml | oidc
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    isTestMode: boolean("is_test_mode").notNull().default(false),
    domainRouting: text("domain_routing"), // nullable: domain that routes to this IdP
    attributeMapping: jsonb("attribute_mapping"),
    groupMapping: jsonb("group_mapping"),
    roleMapping: jsonb("role_mapping"),
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** SAML-specific settings for an identity provider. Cert is a KMS reference. */
export const samlConfigurations = pgTable(
  "saml_configurations",
  {
    id: pk(),
    identityProviderId: uuid("identity_provider_id")
      .notNull()
      .references(() => identityProviders.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    ssoUrl: text("sso_url").notNull(),
    sloUrl: text("slo_url"),
    x509CertRef: text("x509_cert_ref").notNull(), // KMS reference
    signRequests: boolean("sign_requests").notNull().default(false),
    metadataXml: text("metadata_xml"),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.identityProviderId)],
);

/** OIDC-specific settings. clientSecretRef is a KMS reference, never plaintext. */
export const oidcConfigurations = pgTable(
  "oidc_configurations",
  {
    id: pk(),
    identityProviderId: uuid("identity_provider_id")
      .notNull()
      .references(() => identityProviders.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    clientId: text("client_id").notNull(),
    clientSecretRef: text("client_secret_ref").notNull(), // KMS reference
    authorizationEndpoint: text("authorization_endpoint"),
    tokenEndpoint: text("token_endpoint"),
    userinfoEndpoint: text("userinfo_endpoint"),
    jwksUri: text("jwks_uri"),
    scopes: text("scopes"),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.identityProviderId)],
);

/** Per-org SCIM provisioning settings. */
export const scimConfigurations = pgTable(
  "scim_configurations",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    enabled: boolean("enabled").notNull().default(false),
    baseUrl: text("base_url"),
    deprovisionPolicy: text("deprovision_policy").notNull().default("suspend"), // suspend | delete
    ...timestamps,
  },
  (t) => [index().on(t.organisationId)],
);

/** Bearer tokens for the SCIM endpoint; stored hashed, never plaintext. */
export const scimTokens = pgTable(
  "scim_tokens",
  {
    id: pk(),
    scimConfigurationId: uuid("scim_configuration_id")
      .notNull()
      .references(() => scimConfigurations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    name: text("name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.scimConfigurationId)],
);
