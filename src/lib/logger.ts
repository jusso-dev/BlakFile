/**
 * Structured logger (pino). Sensitive fields are redacted at the logger level so
 * file contents, secrets, and tokens can never leak into logs even if a caller
 * passes them by mistake (spec §25). Never log file bytes or secret material.
 */
import pino from "pino";
import { env, isProd } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.accessToken",
      "*.refreshToken",
      "*.clientSecret",
      "*.authorization",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.content",
      "*.fileBytes",
      "*.kmsKey",
    ],
    censor: "[redacted]",
  },
  base: { service: "blakfile" },
});

/** Child logger bound to a correlation ID + org for request-scoped logging. */
export function requestLogger(fields: {
  correlationId: string;
  organisationId?: string;
  actorId?: string;
}) {
  return logger.child(fields);
}
