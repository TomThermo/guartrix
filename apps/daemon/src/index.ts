import os from "node:os";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { z } from "zod";
import type { ServerType } from "@msm/shared";
import { ALL_SERVER_TYPES } from "@msm/shared";
import {
  cleanupLeftoverContainers,
  getDiskUsageCached,
  collectServerStats,
  fixDataOwnership,
  getMysqlStatus,
  hostNodeName,
  hostPublicIp,
  hostTotalMemoryGb,
  hostTotalMemoryMb,
  hostLocalIps,
  hostCpuCount,
  hostLoadAvg,
  hostDiskUsage,
  isContainerRunning,
  listGuartrixContainers,
  getDockerVersion,
  getStatsForContainers,
  normalizeContainerStats,
  formatBytes,
  processManager,
  resourceMonitor,
  writeServerLimits,
  serverDir,
  startSftpServer,
  sftpConfigFromEnv,
  ensureBedrockRuntimeImage,
  bedrockRuntimeImageExists,
  ensureDaemonPortPanelOnly,
  type DaemonServerConfig,
} from "@msm/node-agent";
import { daemonConfig } from "./config.js";
import { requireDaemonAuth } from "./auth.js";
import { registerDaemonRateLimit } from "./rate-limit.js";
import { registerDaemonMetrics } from "./metrics.js";
import {
  acceptLicenseTicket,
  assertDaemonAllowsStart,
  DaemonLicenseError,
  getLicenseTicketStatus,
} from "./license-gate.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerMysqlRoutes } from "./routes/mysql.js";
import { registerFirewallRoutes } from "./routes/firewall.js";
import { registerWebSocketRoutes } from "./routes/websockets.js";

async function activeGameServerIds(): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const containers = await listGuartrixContainers();
    for (const c of containers) {
      if (c.isMysql || !c.serverId) continue;
      const state = (c.state || "").toLowerCase();
      if (state === "running" || state === "restarting") {
        ids.add(c.serverId);
      }
    }
  } catch {
    /* docker may be briefly unavailable */
  }
  // Also trust in-memory STARTING (container not listed yet).
  // processManager doesn't expose a list API — probe known configs via getLastConfig is incomplete.
  // Power start path passes server id; we only need "others", so container list is enough.
  return [...ids];
}

async function enforceStartGate(server: DaemonServerConfig): Promise<void> {
  const others = await activeGameServerIds();
  assertDaemonAllowsStart({
    serverId: server.id,
    memoryMb: server.memoryMb,
    diskMb: server.diskMb ?? 10_240,
    otherActiveServerIds: others,
  });
}

async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[guartrix-daemon] Sentry init skipped: ${msg}`);
  }
}

const serverTypeSchema = z.enum(
  ALL_SERVER_TYPES as [ServerType, ...ServerType[]],
);

const daemonServerConfigSchema = z.object({
  id: z.string().min(1),
  type: serverTypeSchema,
  mcVersion: z.string().min(1),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  autoRestart: z.boolean(),
  javaVersion: z.string().min(1).max(8).nullable().optional(),
  startupCommand: z.string().max(4000).nullable().optional(),
  serverJar: z.string().min(1).max(128).nullable().optional(),
  diskMb: z.number().int().min(0).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  ports: z
    .array(
      z.object({
        port: z.number().int().min(1024).max(65535),
        protocol: z.enum(["tcp", "udp"]),
      }),
    )
    .max(64)
    .optional(),
});

const powerBodySchema = z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
  server: daemonServerConfigSchema.optional(),
});

const commandBodySchema = z.object({
  command: z.string().min(1),
});

async function main() {
  await initSentry();

  const app = Fastify({
    logger: true,
    bodyLimit: 32 * 1024 * 1024,
    connectionTimeout: 0,
    requestTimeout: 0,
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body || body === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(websocket);
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  registerDaemonRateLimit(app);

  app.addHook("preHandler", requireDaemonAuth);

  registerDaemonMetrics(app);

  app.get("/health", async () => ({ ok: true }));

  /** Panel pushes signed/free license tickets here after validate. */
  app.post("/license/ticket", async (request, reply) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as { ticket?: unknown }).ticket ?? request.body
        : request.body;
    const result = acceptLicenseTicket(body);
    if (!result.ok) {
      return reply.status(400).send({ error: result.error });
    }
    return { ok: true, mode: result.mode, status: getLicenseTicketStatus() };
  });

  app.get("/license/ticket", async () => getLicenseTicketStatus());

  /** Readiness: daemon process is up and Docker Engine is reachable. */
  app.get("/ready", async (_request, reply) => {
    try {
      await getDockerVersion();
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false, error: "docker unavailable" });
    }
  });

  let sftpHandle: Awaited<ReturnType<typeof startSftpServer>> | null = null;

  app.get("/system", async () => ({
    totalMemoryMb: hostTotalMemoryMb(),
    totalMemoryGb: hostTotalMemoryGb(),
    hostname: hostNodeName(),
    publicIp: hostPublicIp(),
    version: `${os.type()} ${os.release()}`,
    uptime: process.uptime(),
    daemonVersion: daemonConfig.version,
    sftp: {
      port: sftpHandle?.port ?? Number(process.env.SFTP_PORT ?? 2022),
      listening: Boolean(sftpHandle?.listening),
    },
    mysql: await getMysqlStatus().catch(() => ({
      running: false,
      container: "guartrix-mysql",
      image: "mysql:8.4",
      host: hostPublicIp() ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
    })),
  }));

  registerMysqlRoutes(app);

  /** Full health snapshot for the /statusline admin dashboard. */
  app.get("/status", async () => {
    const cpuCount = hostCpuCount();
    const [mysql, containers, dockerVersion, disk] = await Promise.all([
      getMysqlStatus().catch(() => null),
      listGuartrixContainers().catch(() => []),
      getDockerVersion().catch(() => "unknown"),
      hostDiskUsage().catch(() => null),
    ]);

    const runningNames = containers
      .filter((c) => c.state.toLowerCase() === "running")
      .map((c) => c.name);

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
      daemonMemoryRssMb:
        Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
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
      mysql,
      sftp: {
        port: sftpHandle?.port ?? Number(process.env.SFTP_PORT ?? 2022),
        listening: Boolean(sftpHandle?.listening),
      },
      containers: containersWithStats,
    };
  });

  app.post<{ Params: { id: string } }>(
    "/servers/:id/power",
    async (request, reply) => {
      const parsed = powerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const { action, server } = parsed.data;
      const id = request.params.id;

      try {
        if (action === "stop") {
          await processManager.stop(id);
          return { ok: true, status: processManager.getStatus(id) };
        }

        if (action === "kill") {
          await processManager.kill(id);
          return { ok: true, status: processManager.getStatus(id) };
        }

        if (action === "start") {
          if (!server) {
            return reply
              .status(400)
              .send({ error: "server config is required for start" });
          }
          if (server.id !== id) {
            return reply
              .status(400)
              .send({ error: "server.id must match path :id" });
          }
          await enforceStartGate(server as DaemonServerConfig);
          await processManager.start(server as DaemonServerConfig);
          return { ok: true, status: processManager.getStatus(id) };
        }

        // restart = stop then start
        await processManager.stop(id);
        const cfg =
          server ??
          processManager.getLastConfig(id);
        if (!cfg) {
          return reply.status(400).send({
            error: "server config is required for restart when no prior start",
          });
        }
        const next: DaemonServerConfig = { ...cfg, id };
        await enforceStartGate(next);
        await processManager.start(next);
        return { ok: true, status: processManager.getStatus(id) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof DaemonLicenseError ? err.code : undefined;
        return reply
          .status(err instanceof DaemonLicenseError ? 403 : 400)
          .send({ error: message, ...(code ? { code } : {}) });
      }
    },
  );

  app.put<{ Params: { id: string } }>(
    "/servers/:id/limits",
    async (request, reply) => {
      const parsed = z
        .object({
          diskMb: z.number().int().min(0).max(10_485_760),
          cpuLimit: z.number().int().min(0).max(10_000),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      await writeServerLimits(request.params.id, parsed.data);
      return { ok: true, ...parsed.data };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/servers/:id/command",
    async (request, reply) => {
      const parsed = commandBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        await processManager.sendCommand(request.params.id, parsed.data.command);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { disk?: string };
  }>("/servers/:id/stats", async (request) => {
    const includeDisk =
      request.query.disk === "1" ||
      request.query.disk === "true" ||
      request.query.disk === "";
    return collectServerStats(request.params.id, { includeDisk });
  });

  app.get<{ Params: { id: string } }>(
    "/servers/:id/disk",
    async (request) => getDiskUsageCached(request.params.id),
  );

  app.get<{ Params: { id: string } }>(
    "/servers/:id/players",
    async (request) => ({
      online: processManager.getOnlinePlayerNames(request.params.id),
    }),
  );

  app.get<{ Params: { id: string } }>(
    "/servers/:id/history",
    async (request) => ({
      lines: processManager.getHistory(request.params.id),
    }),
  );

  // --- Files (mirror panel file browser) ---
  registerFileRoutes(app);

  // --- Firewall ---
  registerFirewallRoutes(app);

  app.post("/cleanup-containers", async (_request, reply) => {
    try {
      const removed = await cleanupLeftoverContainers();
      return { ok: true, removed };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  app.post<{
    Body: { port?: number; protocol?: string };
  }>("/ports/check", async (request, reply) => {
    const port = Number(request.body?.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return reply.status(400).send({ error: "port is required" });
    }
    const protocol =
      request.body?.protocol === "udp" ? "udp" : ("tcp" as const);
    const free = await processManager.isPortFree(port, protocol);
    return { free };
  });

  app.post<{ Params: { id: string } }>(
    "/servers/:id/chown",
    async (request, reply) => {
      try {
        await fixDataOwnership(serverDir(request.params.id));
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/servers/:id/running",
    async (request) => {
      const id = request.params.id;
      if (processManager.isRunning(id)) {
        return { running: true, status: processManager.getStatus(id) };
      }
      // Not tracked in-memory — e.g. the daemon was just restarted (crash,
      // update, watchdog). The container itself keeps running independently
      // (it isn't killed just because the daemon process died), so fall back
      // to asking Docker directly instead of falsely reporting "stopped".
      const actuallyRunning = await isContainerRunning(id).catch(() => false);
      return {
        running: actuallyRunning,
        status: actuallyRunning ? "RUNNING" : processManager.getStatus(id),
      };
    },
  );

  // --- WebSockets ---
  registerWebSocketRoutes(app);

  const shutdown = async (signal: string) => {
    // Deliberately do NOT stop managed Minecraft servers here — this runs on
    // every panel restart (deploy, crash, watchdog-triggered restart), and a
    // panel restart must never take down live gameplay. The containers keep
    // running and get re-detected as RUNNING by the next daemon instance.
    app.log.info(`Received ${signal} — closing daemon (servers keep running)`);
    try {
      await sftpHandle?.close();
    } catch {
      // ignore
    }
    try {
      processManager.flushForShutdown();
    } catch (err) {
      app.log.error(err);
    }
    try {
      await app.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: daemonConfig.host, port: daemonConfig.port });
  app.log.info(
    `Guartrix daemon listening on http://${daemonConfig.host}:${daemonConfig.port}`,
  );

  void ensureDaemonPortPanelOnly(daemonConfig.port).catch((err) => {
    app.log.warn(err, "Daemon port firewall restriction failed");
  });

  try {
    sftpHandle = await startSftpServer(sftpConfigFromEnv(daemonConfig.token));
    if (sftpHandle.listening) {
      app.log.info(`SFTP listening on 0.0.0.0:${sftpHandle.port}`);
    }
  } catch (err) {
    app.log.error(err, "Failed to start SFTP server");
  }

  void (async () => {
    try {
      if (await bedrockRuntimeImageExists()) {
        app.log.info("Bedrock runtime image already present");
        return;
      }
      app.log.info("Pre-building Bedrock runtime image (ca-certificates)…");
      await ensureBedrockRuntimeImage();
      app.log.info("Bedrock runtime image ready");
    } catch (err) {
      app.log.warn(
        err,
        "Bedrock runtime image prebuild failed — will retry on server start",
      );
    }
  })();

  // Reclaim Minecraft containers that kept running across a previous daemon exit.
  try {
    const adopted = await processManager.reattachOrphans();
    if (adopted > 0) {
      app.log.info(`Reattached console to ${adopted} running Minecraft container(s)`);
    }
  } catch (err) {
    app.log.error(err, "Failed to reattach orphan Minecraft containers");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
