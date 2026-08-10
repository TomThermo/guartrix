import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import pino from "pino";

/**
 * Shared pino logger for boot / background work.
 * Fastify gets the same instance so request logs share format + level.
 */
const pinoLogger = pino({
  level: process.env.LOG_LEVEL?.trim() || "info",
  base: { service: "guartrix-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Fastify-compatible logger (pino + FastifyBaseLogger structural cast). */
export const logger = pinoLogger as typeof pinoLogger & FastifyBaseLogger;

/** Prefer inbound `x-request-id`, else mint one for correlation. */
export function genReqId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers["x-request-id"];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  if (fromHeader && /^[\w.=-]{8,128}$/.test(fromHeader)) return fromHeader;
  return randomUUID();
}
