/**
 * Better Auth instance. We do NOT implement auth cryptography ourselves — Better
 * Auth owns password hashing, sessions, passkeys, MFA. It is wired to the same
 * PostgreSQL via the Drizzle adapter, mapping onto our `users`/`sessions`/
 * `accounts` tables.
 *
 * Phase 1 enables email/password + email verification. Passkeys, TOTP MFA, SSO
 * (SAML/OIDC) and SCIM are enabled in Phase 3 (Enterprise Identity) — the schema
 * and admin surfaces already exist for them.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db";
import { env, isProd } from "./env";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: isProd,
  },
  session: {
    expiresIn: 60 * 60 * 8, // 8h; org policy can tighten in Phase 3
    updateAge: 60 * 60,
  },
  advanced: {
    cookiePrefix: "blakfile",
    useSecureCookies: isProd,
  },
});

export type Auth = typeof auth;
