import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import client from "prom-client";
import { prisma } from "./db.js";
import { countTransferJobsInMemory } from "../servers/transfer.js";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "guartrix_api_" });

const httpRequestsTotal = new client.Counter({
  name: "guartrix_api_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: "guartrix_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const serversByStatus = new client.Gauge({
  name: "guartrix_api_servers_by_status",
  help: "Server count by status (cached ~15s)",
  labelNames: ["status"] as const,
  registers: [register],
});

const transferJobsGauge = new client.Gauge({
  name: "guartrix_api_transfer_jobs",
  help: "In-memory server transfer jobs",
  registers: [register],
});

const SERVER_STATUSES = [
  "STOPPED",
  "STARTING",
  "RUNNING",
  "STOPPING",
  "ERROR",
  "CREATING",
  "TRANSFERRING",
] as const;

let statusCacheAt = 0;
let statusCache: Record<string, number> = Object.fromEntries(SERVER_STATUSES.map((s) => [s, 0]));

async function refreshServerStatusGauges(): Promise<void> {
  const now = Date.now();
  if (now - statusCacheAt < 15_000 && statusCacheAt > 0) {
    for (const status of SERVER_STATUSES) {
      serversByStatus.set({ status }, statusCache[status] ?? 0);
    }
    return;
  }
  const rows = await prisma.server.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const next: Record<string, number> = Object.fromEntries(SERVER_STATUSES.map((s) => [s, 0]));
  for (const row of rows) {
    next[row.status] = row._count._all;
  }
  statusCache = next;
  statusCacheAt = now;
  for (const status of SERVER_STATUSES) {
    serversByStatus.set({ status }, next[status] ?? 0);
  }
}

function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const bare = addr.replace(/^::ffff:/i, "").toLowerCase();
  return bare === "127.0.0.1" || bare === "::1" || bare === "localhost";
}

/**
 * METRICS_TOKEN set → Bearer header required (no ?token= — avoids log/Referer leaks).
 * Unset → only raw loopback peers (ignores X-Forwarded-For).
 */
export function assertMetricsAccess(request: FastifyRequest): boolean {
  const expected = process.env.METRICS_TOKEN?.trim();
  if (expected) {
    const auth = request.headers.authorization;
    const bearer =
      typeof auth === "string" ? /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() : undefined;
    return bearer === expected;
  }
  return isLoopbackAddress(request.socket.remoteAddress);
}

function routeLabel(request: FastifyRequest): string {
  const route =
    typeof request.routeOptions?.url === "string"
      ? request.routeOptions.url
      : (request.url.split("?")[0] ?? "unknown");
  return route;
}

async function metricsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!assertMetricsAccess(request)) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  try {
    await refreshServerStatusGauges();
  } catch {
    // Keep last cache / zeros — still export process metrics.
  }
  transferJobsGauge.set(countTransferJobsInMemory());
  const body = await register.metrics();
  await reply.header("Content-Type", register.contentType).send(body);
}

export function registerMetrics(app: FastifyInstance): void {
  app.addHook("onResponse", (request, reply, done) => {
    const pathOnly = request.url.split("?")[0] ?? "";
    if (pathOnly === "/api/metrics" || pathOnly === "/metrics") {
      done();
      return;
    }
    const labels = {
      method: request.method,
      route: routeLabel(request),
      status: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    const elapsed = typeof reply.elapsedTime === "number" ? reply.elapsedTime / 1000 : undefined;
    if (elapsed != null && Number.isFinite(elapsed)) {
      httpRequestDuration.observe(labels, elapsed);
    }
    done();
  });

  app.get("/api/metrics", metricsHandler);
  app.get("/metrics", metricsHandler);
}
