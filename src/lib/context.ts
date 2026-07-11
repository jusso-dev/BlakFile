/**
 * Application request context passed into every domain service. It carries the
 * authenticated principal (for authorisation), the request metadata (for audit +
 * step-up decisions), and is the single object services need to enforce security.
 *
 * The API/MCP/web layers build this after authentication; services never trust
 * anything outside it (no client-supplied tenant IDs, no ambient globals).
 */
import type { Principal, RequestContext } from "@/domains/authorisation";

export interface AppContext {
  principal: Principal;
  request: RequestContext;
}

/** Convenience: the acting org. Services scope every query to this. */
export function orgOf(ctx: AppContext): string {
  return ctx.principal.organisationId;
}
