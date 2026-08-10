import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import client from "prom-client";
import { getDockerVersion } from "@guartrix/node-agent";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "guartrix_daemon_" });

const dockerReachable = new client.Gauge({
  name: "guartrix_daemon_docker_reachable",
  help: "1 if Docker Engine responds to version, else 0",
  registers: [register],
});

function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const bare = addr.replace(/^::ffff:/i, "").toLowerCase();
  return bare === "127.0.0.1" || bare === "::1" || bare === "localhost";
}

/** Token (when METRICS_TOKEN set) via Authorization Bearer only; else loopback. */
export function isMetricsTokenOrLocalhost(request: FastifyRequest): boolean {
  const expected = process.env.METRICS_TOKEN?.trim();
  if (expected) {
    const auth = request.headers.authorization;
    const bearer =
      typeof auth === "string" ? /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() : undefined;
    return bearer === expected;
  }
  return isLoopbackAddress(request.socket.remoteAddress);
}

async function metricsHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Auth is enforced in requireDaemonAuth (JWT, METRICS_TOKEN, or localhost).
  try {
    await getDockerVersion();
    dockerReachable.set(1);
  } catch {
    dockerReachable.set(0);
  }
  const body = await register.metrics();
  await reply.header("Content-Type", register.contentType).send(body);
}

export function registerDaemonMetrics(app: FastifyInstance): void {
  app.get("/metrics", metricsHandler);
}
