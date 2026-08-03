import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the API process.
 *
 * Connection pooling: Prisma uses the connection string as-is. For MySQL,
 * tune via DATABASE_URL query params, e.g.:
 *   ?connection_limit=10&pool_timeout=20&connect_timeout=10
 * (MariaDB/MySQL connector supports connection_limit / pool_timeout.)
 * Prefer a dedicated pooler (ProxySQL / RDS Proxy) only when running
 * multiple API replicas — see docs/wiki/scaling.md.
 *
 * Slow queries: set `PRISMA_SLOW_MS` (e.g. `200`) to log statements that
 * exceed that duration via `$on('query')`. Otherwise only Prisma warn/error.
 */
const slowMsRaw = process.env.PRISMA_SLOW_MS?.trim();
const slowMs =
  slowMsRaw && Number.isFinite(Number(slowMsRaw)) && Number(slowMsRaw) > 0
    ? Number(slowMsRaw)
    : null;

function createPrisma(): PrismaClient {
  if (slowMs == null) {
    return new PrismaClient({ log: ["warn", "error"] });
  }

  const client = new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ],
  });

  client.$on("query", (e) => {
    if (e.duration < slowMs) return;
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "Slow Prisma query",
        durationMs: e.duration,
        target: e.target,
        query: e.query,
      }),
    );
  });

  return client;
}

export const prisma = createPrisma();
