import os from "node:os";
import type { FastifyInstance } from "fastify";
import {
  formatBytes,
  getDockerVersion,
  getMysqlStatus,
  getStatsForContainers,
  hostCpuCount,
  hostDiskUsage,
  hostLoadAvg,
  hostLocalIps,
  hostNetworkTotals,
  hostNodeName,
  hostPublicIp,
  hostTotalMemoryGb,
  hostTotalMemoryMb,
  listGuartrixContainers,
  normalizeContainerStats,
  resourceMonitor,
  type SftpServerHandle,
} from "@msm/node-agent";
import { daemonConfig } from "../config.js";

export type DaemonStatusDeps = {
  /** Mutable SFTP handle set after listen; routes read via getter. */
  getSftpHandle: () => SftpServerHandle | null;
};

function sftpSnapshot(handle: SftpServerHandle | null) {
  return {
    port: handle?.port ?? Number(process.env.SFTP_PORT ?? 2022),
    listening: Boolean(handle?.listening),
  };
}

/** Health, readiness, and host/status snapshot routes. */
export function registerDaemonStatusRoutes(app: FastifyInstance, deps: DaemonStatusDeps): void {
  app.get("/health", async () => ({ ok: true }));

  /** Readiness: daemon process is up and Docker Engine is reachable. */
  app.get("/ready", async (_request, reply) => {
    try {
      await getDockerVersion();
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false, error: "docker unavailable" });
    }
  });

  app.get("/system", async () => ({
    totalMemoryMb: hostTotalMemoryMb(),
    totalMemoryGb: hostTotalMemoryGb(),
    hostname: hostNodeName(),
    publicIp: hostPublicIp(),
    version: `${os.type()} ${os.release()}`,
    uptime: process.uptime(),
    daemonVersion: daemonConfig.version,
    sftp: sftpSnapshot(deps.getSftpHandle()),
    mysql: await getMysqlStatus().catch(() => ({
      running: false,
      container: "guartrix-mysql",
      image: "mysql:8.4",
      host: hostPublicIp() ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
    })),
  }));

  /** Full health snapshot for the /statusline admin dashboard. */
  app.get("/status", async () => {
    const cpuCount = hostCpuCount();
    const [mysql, containers, dockerVersion, disk, network] = await Promise.all([
      getMysqlStatus().catch(() => null),
      listGuartrixContainers().catch(() => []),
      getDockerVersion().catch(() => "unknown"),
      hostDiskUsage().catch(() => null),
      hostNetworkTotals().catch(() => ({ rxBytes: 0, txBytes: 0 })),
    ]);

    // Prefer live resourceMonitor cache (Docker Engine stream); fill gaps via CLI
    const needCli: string[] = [];
    for (const c of containers) {
      if (c.state.toLowerCase() !== "running") continue;
      if (c.serverId && resourceMonitor.getCached(c.serverId)?.running) continue;
      needCli.push(c.name);
    }
    const statsByName = needCli.length
      ? await getStatsForContainers(needCli).catch(() => new Map())
      : new Map();

    const containersWithStats = containers.map((c) => {
      const cached = c.serverId ? resourceMonitor.getCached(c.serverId) : null;
      if (cached?.running) {
        return {
          ...c,
          cpuPercent: cached.cpuPercent,
          memoryUsedBytes: cached.memoryUsedBytes,
          memoryLimitBytes: cached.memoryLimitBytes,
          memoryPercent: cached.memoryPercent,
          memoryUsedLabel: cached.memoryUsedLabel,
          memoryLimitLabel: cached.memoryLimitLabel,
        };
      }
      const raw = statsByName.get(c.name);
      if (!raw) {
        return {
          ...c,
          cpuPercent: 0,
          memoryUsedBytes: 0,
          memoryLimitBytes: 0,
          memoryPercent: 0,
          memoryUsedLabel: "0 B",
          memoryLimitLabel: "0 B",
        };
      }
      const n = normalizeContainerStats(raw, cpuCount);
      return {
        ...c,
        cpuPercent: n.cpuPercent,
        memoryUsedBytes: n.memoryUsedBytes,
        memoryLimitBytes: n.memoryLimitBytes,
        memoryPercent: n.memoryPercent,
        memoryUsedLabel: formatBytes(n.memoryUsedBytes),
        memoryLimitLabel: formatBytes(n.memoryLimitBytes),
      };
    });

    return {
      hostname: hostNodeName(),
      publicIp: hostPublicIp(),
      localIps: hostLocalIps(),
      osVersion: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuCount,
      loadAvg: hostLoadAvg(),
      dockerVersion,
      daemonVersion: daemonConfig.version,
      daemonPid: process.pid,
      daemonPort: daemonConfig.port,
      daemonMemoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      uptime: process.uptime(),
      totalMemoryMb: hostTotalMemoryMb(),
      totalMemoryGb: hostTotalMemoryGb(),
      freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
      disk: disk
        ? {
            ...disk,
            totalLabel: formatBytes(disk.totalBytes),
            usedLabel: formatBytes(disk.usedBytes),
            freeLabel: formatBytes(disk.freeBytes),
          }
        : null,
      network: {
        rxBytes: network.rxBytes,
        txBytes: network.txBytes,
        rxLabel: formatBytes(network.rxBytes),
        txLabel: formatBytes(network.txBytes),
      },
      mysql,
      sftp: sftpSnapshot(deps.getSftpHandle()),
      containers: containersWithStats,
    };
  });
}
