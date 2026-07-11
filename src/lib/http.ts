/**
 * REST helpers. Maps domain errors to structured, non-leaky JSON responses and
 * attaches the correlation/request id. Internal errors never expose stack traces
 * or messages to the client.
 */
import { ZodError } from "zod";
import { DomainError, statusForCode } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { newCorrelationId } from "@/lib/ids";

export interface ApiErrorBody {
  error: { code: string; message: string; correlationId: string; details?: unknown };
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(err: unknown, correlationId = newCorrelationId()): Response {
  if (err instanceof ZodError) {
    return Response.json(
      { error: { code: "validation", message: "Invalid request", correlationId, details: err.flatten() } } satisfies ApiErrorBody,
      { status: 422, headers: { "x-correlation-id": correlationId } },
    );
  }
  if (err instanceof DomainError) {
    return Response.json(
      { error: { code: err.code, message: err.publicMessage, correlationId } } satisfies ApiErrorBody,
      { status: statusForCode(err.code), headers: { "x-correlation-id": correlationId } },
    );
  }
  // Unknown: log server-side, return opaque 500.
  logger.error({ err, correlationId }, "unhandled API error");
  return Response.json(
    { error: { code: "internal", message: "Internal error", correlationId } } satisfies ApiErrorBody,
    { status: 500, headers: { "x-correlation-id": correlationId } },
  );
}
