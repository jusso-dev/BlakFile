import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pk, timestamps, assuranceLevelEnum } from "./_shared";

/**
 * Better Auth core user table. GLOBAL identity (not tenant-scoped); a single
 * human can belong to many organisations via organisationMembers.
 */
export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull(), // stored lower-cased; treat as citext
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name"),
    image: text("image"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    status: text("status").notNull().default("active"), // active | suspended | deprovisioned
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.email)],
);

/** Better Auth session. Carries the active org context and auth assurance level. */
export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganisationId: uuid("active_organisation_id"), // nullable org context
    assuranceLevel: assuranceLevelEnum("assurance_level").notNull().default("aal1"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.token), index().on(t.userId)],
);

/** Linked auth providers / credentials for a user (Better Auth accounts). */
export const accounts = pgTable(
  "accounts",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"), // hashed; null for federated providers
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.providerId, t.accountId),
    index().on(t.userId),
  ],
);

/** WebAuthn/passkey credentials bound to a user. */
export const passkeys = pgTable(
  "passkeys",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: text("transports"),
    name: text("name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.credentialId), index().on(t.userId)],
);

/** Second-factor authenticators. Secrets are KMS references, never plaintext. */
export const mfaFactors = pgTable(
  "mfa_factors",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // totp | webauthn | sms
    secretRef: text("secret_ref").notNull(), // KMS reference
    verified: boolean("verified").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/** One-time MFA recovery codes; stored hashed, marked used on redemption. */
export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/** Remembered devices that skip step-up MFA until expiry or revocation. */
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceFingerprint: text("device_fingerprint").notNull(),
    name: text("name"),
    lastSeenIp: text("last_seen_ip"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);
