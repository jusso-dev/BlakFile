/**
 * Better Auth HTTP handler — mounts all auth endpoints (sign-up, sign-in,
 * session, verification, and in Phase 3 passkeys/MFA/SSO) under /api/auth/*.
 */
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
