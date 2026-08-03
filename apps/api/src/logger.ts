import { randomUUID } from "node:crypto";
import pino from "pino";

/**
 * Shared pino logger for boot / background work.
 * Fastify gets the same instance so request logs share format + level.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
  base: { service: "guartrix-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Prefer inbound `x-request-id`, else mint one for correlation. */
export function genReqId(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const raw = req.headers["x-request-id"];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  if (fromHeader && /^[\w.=-]{8,128}$/.test(fromHeader)) return fromHeader;
  return randomUUID();
}
