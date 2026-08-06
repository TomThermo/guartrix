import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import {
  cleanupLeftoverContainers,
  getDiskUsageCached,
  collectServerStats,
  fixDataOwnership,
  isContainerRunning,
  processManager,
  serverDir,
  startSftpServer,
  sftpConfigFromEnv,
  ensureBedrockRuntimeImage,
  bedrockRuntimeImageExists,
  ensureDaemonPortPanelOnly,
  type SftpServerHandle,
} from "@msm/node-agent";
import { daemonConfig } from "./config.js";
import { requireDaemonAuth } from "./auth.js";
import { registerDaemonRateLimit } from "./rate-limit.js";
import { registerDaemonMetrics } from "./metrics.js";
import {
  acceptLicenseTicket,
  getLicenseTicketStatus,
} from "./license-gate.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerMysqlRoutes } from "./routes/mysql.js";
import { registerFirewallRoutes } from "./routes/firewall.js";
import { registerWebSocketRoutes } from "./routes/websockets.js";
import { registerDaemonPowerRoutes } from "./routes/power.js";
import { registerDaemonStatusRoutes } from "./routes/status.js";

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

  let sftpHandle: SftpServerHandle | null = null;

  registerDaemonStatusRoutes(app, {
    getSftpHandle: () => sftpHandle,
  });

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

  registerMysqlRoutes(app);

  registerDaemonPowerRoutes(app);

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
