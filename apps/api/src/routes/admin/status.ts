import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type {
  AdminStatusResponse,
  StatusContainer,
  StatusNode,
} from "@msm/shared";
import { requireAdmin } from "../../auth/auth.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { daemonGetStatus } from "../../nodes/daemon-client.js";
import { nodePublicUrl } from "../../nodes/nodes.js";
import { getPanelVersionStatus } from "../../license/license.js";
import { getProductVersion } from "../../product-version.js";

function readPidFile(name: string): number | null {
  try {
    const raw = fs.readFileSync(
      path.join(config.dataDir, "run", `${name}.pid`),
      "utf8",
    );
    const pid = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function probeWebOk(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

/** Synthetic row for panel servers whose Docker container was removed on stop. */
function stoppedServerRow(server: {
  id: string;
  name: string;
  status: StatusContainer["serverStatus"];
  port: number;
}): StatusContainer {
  return {
    id: `panel-${server.id}`,
    name: `guartrix-${server.id}`,
    image: "—",
    state: "exited",
    status: "No container (stopped)",
    createdAt: "",
    ports: String(server.port),
    serverId: server.id,
    serverName: server.name,
    serverStatus: server.status,
    isMysql: false,
    cpuPercent: 0,
    memoryUsedBytes: 0,
    memoryLimitBytes: 0,
    memoryPercent: 0,
    memoryUsedLabel: "—",
    memoryLimitLabel: "—",
  };
}

function mergeNodeContainers(
  dockerContainers: StatusContainer[],
  nodeServers: Array<{
    id: string;
    name: string;
    status: StatusContainer["serverStatus"];
    port: number;
  }>,
): StatusContainer[] {
  const seen = new Set(
    dockerContainers
      .map((c) => c.serverId)
      .filter((id): id is string => Boolean(id)),
  );
  const missing = nodeServers
    .filter((s) => !seen.has(s.id))
    .map(stoppedServerRow);
  const mc = [...dockerContainers.filter((c) => !c.isMysql), ...missing];
  const mysql = dockerContainers.filter((c) => c.isMysql);
  return [...mc, ...mysql];
}

export function registerStatusRoutes(app: FastifyInstance): void {
  app.get("/api/admin/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "status.read"))) return;

    const [nodes, servers] = await Promise.all([
      prisma.node.findMany({
        orderBy: [{ isLocal: "desc" }, { createdAt: "asc" }],
      }),
      prisma.server.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          nodeId: true,
          port: true,
        },
      }),
    ]);

    const serverById = new Map(servers.map((s) => [s.id, s]));
    const serversByNode = new Map<string, typeof servers>();
    for (const s of servers) {
      const key = s.nodeId ?? "";
      const list = serversByNode.get(key) ?? [];
      list.push(s);
      serversByNode.set(key, list);
    }

    const statusNodes: StatusNode[] = await Promise.all(
      nodes.map(async (node): Promise<StatusNode> => {
        const publicUrl = nodePublicUrl(node);
        const nodeServers = serversByNode.get(node.id) ?? [];
        try {
          const snapshot = await daemonGetStatus(node.id);
          await prisma.node.update({
            where: { id: node.id },
            data: { status: "ONLINE", lastSeenAt: new Date() },
          });
          const fromDocker: StatusContainer[] = snapshot.containers.map((c) => {
            const server = c.serverId ? serverById.get(c.serverId) : undefined;
            return {
              ...c,
              serverName: server?.name ?? null,
              serverStatus: server?.status ?? null,
            };
          });
          return {
            id: node.id,
            name: node.name,
            isLocal: node.isLocal,
            publicUrl,
            reachable: true,
            daemon: {
              hostname: snapshot.hostname,
              publicIp: snapshot.publicIp,
              localIps: snapshot.localIps,
              osVersion: snapshot.osVersion,
              arch: snapshot.arch,
              cpuCount: snapshot.cpuCount,
              loadAvg: snapshot.loadAvg,
              dockerVersion: snapshot.dockerVersion,
              daemonVersion: snapshot.daemonVersion,
              daemonPid: snapshot.daemonPid,
              daemonPort: snapshot.daemonPort,
              daemonMemoryRssMb: snapshot.daemonMemoryRssMb,
              uptime: snapshot.uptime,
              totalMemoryMb: snapshot.totalMemoryMb,
              totalMemoryGb: snapshot.totalMemoryGb,
              freeMemoryMb: snapshot.freeMemoryMb,
              disk: snapshot.disk,
            },
            mysql: snapshot.mysql,
            sftp: {
              listening: Boolean(snapshot.sftp?.listening),
              port: snapshot.sftp?.port ?? node.sftpPort ?? 2022,
              hostname: node.sftpHostname ?? null,
            },
            containers: mergeNodeContainers(fromDocker, nodeServers),
          };
        } catch (err) {
          await prisma.node.update({
            where: { id: node.id },
            data: { status: "OFFLINE" },
          });
          return {
            id: node.id,
            name: node.name,
            isLocal: node.isLocal,
            publicUrl,
            reachable: false,
            error: err instanceof Error ? err.message : String(err),
            sftp: node.sftpHostname
              ? {
                  listening: false,
                  port: node.sftpPort ?? 2022,
                  hostname: node.sftpHostname,
                }
              : null,
            containers: mergeNodeContainers([], nodeServers),
          };
        }
      }),
    );

    const webPort = Number(process.env.WEB_PORT ?? 80);
    const httpsPortRaw = Number(process.env.HTTPS_PORT ?? 443);
    const httpsEnabled =
      process.env.HTTPS_ENABLED !== "false" &&
      process.env.HTTPS_ENABLED !== "0";
    const webPid = readPidFile("web");
    const watchdogPid = readPidFile("monitor");
    const webProbeOk = await probeWebOk(webPort);
    const webOk = webPid != null || webProbeOk;

    const apiInfo = {
      ok: true as const,
      pid: process.pid,
      uptime: process.uptime(),
      memoryRssMb:
        Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      nodeVersion: process.version,
      port: config.port,
    };

    const [versionStatus, redisStatus] = await Promise.all([
      getPanelVersionStatus(false),
      import("../../redis.js").then((m) => m.getRedisStatus()),
    ]);

    const response: AdminStatusResponse = {
      generatedAt: new Date().toISOString(),
      panel: {
        web: {
          ok: webOk,
          pid: webPid,
          httpPort: webPort,
          httpsPort: httpsEnabled ? httpsPortRaw : null,
          publicHost: config.publicHost,
          url: config.publicBaseUrl.replace(/\/?$/, "/"),
        },
        api: apiInfo,
        watchdog: {
          ok: watchdogPid != null,
          pid: watchdogPid,
        },
        version: versionStatus,
        redis: {
          configured: redisStatus.configured,
          enabled: redisStatus.enabled,
          connected: redisStatus.connected,
          urlMasked: redisStatus.urlMasked,
          latencyMs: redisStatus.latencyMs,
          error: redisStatus.error,
          sessionStore: redisStatus.sessionStore,
          rateLimitStore: redisStatus.rateLimitStore,
        },
      },
      nodes: statusNodes,
    };
    return response;
  });

  app.get("/api/admin/version", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "status.read"))) return;
    return {
      ...(await getPanelVersionStatus(true)),
      productVersion: getProductVersion(),
    };
  });
}
