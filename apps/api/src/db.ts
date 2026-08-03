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
 * Query logging: Prisma `warn`/`error` surfaces slow-query warnings when
 * the engine emits them; set LOG_LEVEL=debug on the process logger for
 * broader API diagnostics (not every SQL statement).
 */
export const prisma = new PrismaClient({
  log: ["warn", "error"],
});
