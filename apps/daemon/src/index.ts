import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { z } from "zod";
import type {
  ConsoleCommand,
  ConsoleMessage,
  ServerStatus,
  ServerType,
} from "@msm/shared";
import { ALL_SERVER_TYPES } from "@msm/shared";
import {
  cleanupLeftoverContainers,
  closeFirewallPort,
  collectDiskUsage,
  getDiskUsageCached,
  collectServerStats,
  createDirectory,
  createMysqlDatabase,
  deleteMysqlDatabase,
  dumpMysqlDatabaseToFile,
  restoreMysqlDatabaseFromFile,
  deletePath,
  ensureMysql,
  fixDataOwnership,
  getContainerLogs,
  getMysqlStatus,
  MYSQL_CONTAINER,
  hostNodeName,
  hostPublicIp,
  hostTotalMemoryGb,
  hostTotalMemoryMb,
  hostLocalIps,
  hostCpuCount,
  hostLoadAvg,
  hostDiskUsage,
  isContainerRunning,
  listFiles,
  listGuartrixContainers,
  getDockerVersion,
  getStatsForContainers,
  normalizeContainerStats,
  formatBytes,
  openFirewallPort,
  processManager,
  resourceMonitor,
  writeServerLimits,
  readFileContent,
  renamePath,
  removeContainer,
  saveUpload,
  resolveDownloadFile,
  compressPaths,
  streamZipPaths,
  decompressArchive,
  deployServerArchive,
  exportServerArchive,
  wipeServerData,
  serverDir,
  writeFileContent,
  startSftpServer,
  sftpConfigFromEnv,
  type DaemonServerConfig,
} from "@msm/node-agent";
import { daemonConfig } from "./config.js";
import { isDaemonAuthorized, requireDaemonAuth } from "./auth.js";

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

const portBodySchema = z.object({
  port: z.number().int().min(1024).max(65535),
  protocol: z.enum(["tcp", "udp"]).optional().default("tcp"),
});

function sendJson(socket: { send: (data: string) => void }, payload: unknown): void {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // closed
  }
}

async function main() {
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

  app.addHook("preHandler", requireDaemonAuth);

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

  app.get("/mysql/status", async () => getMysqlStatus());

  app.get<{ Querystring: { tail?: string } }>("/mysql/logs", async (request) => {
    const tail = Number(request.query.tail ?? 200);
    const lines = await getContainerLogs(MYSQL_CONTAINER, tail);
    return { lines };
  });

  /** Live MySQL container logs for the admin statusline. */
  app.get("/mysql/logs/stream", { websocket: true }, (socket, request) => {
    if (!isDaemonAuthorized(request)) {
      sendJson(socket, { type: "error", message: "Unauthorized" } satisfies ConsoleMessage);
      socket.close();
      return;
    }

    const q = request.query as { tail?: string };
    const tail = Math.max(1, Math.min(2000, Number(q.tail ?? 200) || 200));

    void getContainerLogs(MYSQL_CONTAINER, tail)
      .then((lines) => {
        sendJson(socket, { type: "history", lines } satisfies ConsoleMessage);
      })
      .catch(() => {
        sendJson(socket, { type: "history", lines: [] } satisfies ConsoleMessage);
      });

    const child = spawn(
      "sudo",
      ["-n", "docker", "logs", "-f", "--tail", "0", MYSQL_CONTAINER],
      { env: { ...process.env } },
    );

    const push = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (line === "") continue;
        sendJson(socket, {
          type: "output",
          line,
          stream: "stdout",
        } satisfies ConsoleMessage);
      }
    };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("error", (err) => {
      sendJson(socket, {
        type: "error",
        message: err.message,
      } satisfies ConsoleMessage);
    });

    const cleanup = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });

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

  app.post("/mysql/ensure", async (_request, reply) => {
    try {
      const status = await ensureMysql();
      return { ok: true, mysql: status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  const mysqlCreateSchema = z.object({
    name: z.string().min(2).max(64),
    username: z.string().min(2).max(64),
    password: z.string().min(8).max(128),
    remote: z.string().min(1).max(255).optional(),
  });

  app.post("/mysql/databases", async (request, reply) => {
    const parsed = mysqlCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = await createMysqlDatabase(parsed.data);
      return { ok: true, database: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/mysql/databases/delete", async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(2).max(64),
      username: z.string().min(2).max(64),
      remote: z.string().min(1).max(255).optional(),
    });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await deleteMysqlDatabase(parsed.data);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Body: { name?: string } }>(
    "/mysql/databases/dump",
    async (request, reply) => {
      const name = request.body?.name?.trim();
      if (!name) return reply.status(400).send({ error: "name is required" });
      const tmp = path.join(
        os.tmpdir(),
        `guartrix-mysqldump-${name}-${Date.now()}.sql`,
      );
      try {
        await dumpMysqlDatabaseToFile(name, tmp);
        const buf = await fs.readFile(tmp);
        return reply
          .header("Content-Type", "application/sql")
          .header("Content-Length", String(buf.length))
          .header(
            "Content-Disposition",
            `attachment; filename="${name}.sql"`,
          )
          .send(buf);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  );

  app.post<{ Querystring: { name?: string } }>(
    "/mysql/databases/restore",
    async (request, reply) => {
      const name = request.query.name?.trim();
      if (!name) {
        return reply.status(400).send({ error: "name query param is required" });
      }
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "No dump uploaded" });
      const tmp = path.join(
        os.tmpdir(),
        `guartrix-mysqlrestore-${name}-${Date.now()}.sql`,
      );
      try {
        const { createWriteStream } = await import("node:fs");
        const { pipeline } = await import("node:stream/promises");
        await pipeline(file.file, createWriteStream(tmp));
        await restoreMysqlDatabaseFromFile(name, tmp);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  );
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
        await processManager.start(next);
        return { ok: true, status: processManager.getStatus(id) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
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

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files",
    async (request, reply) => {
      try {
        return await listFiles(request.params.id, request.query.path ?? ".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files/content",
    async (request, reply) => {
      try {
        return await readFileContent(
          request.params.id,
          request.query.path ?? "",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.put<{
    Params: { id: string };
    Body: { path?: string; content?: string };
  }>("/servers/:id/files/content", async (request, reply) => {
    const filePath = request.body?.path;
    if (!filePath) return reply.status(400).send({ error: "path is required" });
    try {
      await writeFileContent(
        request.params.id,
        filePath,
        request.body?.content ?? "",
      );
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { path?: string };
  }>("/servers/:id/files/mkdir", async (request, reply) => {
    const dirPath = request.body?.path?.trim();
    if (!dirPath) return reply.status(400).send({ error: "path is required" });
    try {
      await createDirectory(request.params.id, dirPath);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { from?: string; to?: string };
  }>("/servers/:id/files/rename", async (request, reply) => {
    const from = request.body?.from;
    const to = request.body?.to;
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to are required" });
    }
    try {
      await renamePath(request.params.id, from, to);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files",
    async (request, reply) => {
      const filePath = request.query.path;
      if (!filePath) return reply.status(400).send({ error: "path is required" });
      try {
        await deletePath(request.params.id, filePath);
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Querystring: { path?: string };
  }>("/servers/:id/files/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "No file uploaded" });
    try {
      const saved = await saveUpload(
        request.params.id,
        request.query.path ?? ".",
        file.filename,
        file.file,
      );
      return { ok: true, ...saved };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files/download",
    async (request, reply) => {
      try {
        const info = resolveDownloadFile(
          request.params.id,
          request.query.path ?? "",
        );
        const { createReadStream } = await import("node:fs");
        const safeName = info.fileName.replace(/"/g, "");
        return reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Length", String(info.size))
          .header(
            "Content-Disposition",
            `attachment; filename="${safeName}"`,
          )
          .send(createReadStream(info.absolute));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { paths?: string[]; destination?: string };
  }>("/servers/:id/files/compress", async (request, reply) => {
    const paths = request.body?.paths;
    const destination = request.body?.destination?.trim();
    if (!Array.isArray(paths) || !destination) {
      return reply
        .status(400)
        .send({ error: "paths and destination are required" });
    }
    try {
      const result = await compressPaths(
        request.params.id,
        paths,
        destination,
      );
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { paths?: string[] };
  }>("/servers/:id/files/download-zip", async (request, reply) => {
    const paths = request.body?.paths;
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: "paths are required" });
    }
    try {
      const { stream } = await streamZipPaths(request.params.id, paths);
      return reply
        .header("Content-Type", "application/zip")
        .header(
          "Content-Disposition",
          'attachment; filename="download.zip"',
        )
        .send(stream);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { path?: string; destination?: string };
  }>("/servers/:id/files/decompress", async (request, reply) => {
    const archivePath = request.body?.path?.trim();
    if (!archivePath) {
      return reply.status(400).send({ error: "path is required" });
    }
    try {
      const result = await decompressArchive(
        request.params.id,
        archivePath,
        request.body?.destination?.trim() || undefined,
      );
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  /** Panel pushes a prepared server tree (.tar.gz) onto this node. */
  app.post<{ Params: { id: string } }>(
    "/servers/:id/deploy",
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "No archive uploaded" });
      const tmp = path.join(
        os.tmpdir(),
        `guartrix-deploy-${request.params.id}-${Date.now()}.tar.gz`,
      );
      try {
        const { createWriteStream } = await import("node:fs");
        const { pipeline } = await import("node:stream/promises");
        await pipeline(file.file, createWriteStream(tmp));
        await deployServerArchive(request.params.id, tmp);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  );

  /** Panel pulls a .tar.gz of the server data directory. */
  app.get<{ Params: { id: string } }>(
    "/servers/:id/export",
    async (request, reply) => {
      const tmp = path.join(
        os.tmpdir(),
        `guartrix-export-${request.params.id}-${Date.now()}.tar.gz`,
      );
      try {
        await exportServerArchive(request.params.id, tmp);
        const { createReadStream } = await import("node:fs");
        const st = await fs.stat(tmp);
        return reply
          .header("Content-Type", "application/gzip")
          .header("Content-Length", String(st.size))
          .header(
            "Content-Disposition",
            `attachment; filename="${request.params.id}.tar.gz"`,
          )
          .send(createReadStream(tmp));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      } finally {
        // Delay unlink until stream finishes — Fastify holds the fd
        reply.raw.on("close", () => {
          void fs.rm(tmp, { force: true }).catch(() => undefined);
        });
      }
    },
  );

  /** Stop container (if any) and delete all server files on this node. */
  app.delete<{ Params: { id: string } }>(
    "/servers/:id",
    async (request, reply) => {
      const id = request.params.id;
      try {
        if (processManager.isRunning(id)) {
          await processManager.kill(id).catch(() => undefined);
        }
        await removeContainer(id).catch(() => undefined);
        await wipeServerData(id);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  // --- Firewall ---

  app.post("/firewall/open", async (request, reply) => {
    const parsed = portBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await openFirewallPort(parsed.data.port, parsed.data.protocol);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/firewall/close", async (request, reply) => {
    const parsed = portBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await closeFirewallPort(parsed.data.port, parsed.data.protocol);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

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
    Body: { port?: number };
  }>("/ports/check", async (request, reply) => {
    const port = Number(request.body?.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return reply.status(400).send({ error: "port is required" });
    }
    const free = await processManager.isPortFree(port);
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

  app.get<{ Params: { id: string } }>(
    "/servers/:id/console",
    { websocket: true },
    (socket, request) => {
      if (!isDaemonAuthorized(request)) {
        sendJson(socket, { type: "error", message: "Unauthorized" } satisfies ConsoleMessage);
        socket.close();
        return;
      }

      const serverId = request.params.id;

      const history: ConsoleMessage = {
        type: "history",
        lines: processManager.getHistory(serverId),
      };
      sendJson(socket, history);

      const statusMsg: ConsoleMessage = {
        type: "status",
        status: processManager.getStatus(serverId),
      };
      sendJson(socket, statusMsg);

      const onOutput = (
        id: string,
        line: string,
        stream: "stdout" | "stderr",
      ) => {
        if (id !== serverId) return;
        sendJson(socket, { type: "output", line, stream } satisfies ConsoleMessage);
      };

      const onStatus = (id: string, status: ServerStatus) => {
        if (id !== serverId) return;
        sendJson(socket, { type: "status", status } satisfies ConsoleMessage);
      };

      processManager.on("output", onOutput);
      processManager.on("status", onStatus);

      socket.on("message", (raw) => {
        void (async () => {
          try {
            const data = JSON.parse(String(raw)) as ConsoleCommand;
            if (data.type !== "command" || typeof data.command !== "string") return;
            await processManager.sendCommand(serverId, data.command);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(socket, { type: "error", message } satisfies ConsoleMessage);
          }
        })();
      });

      socket.on("close", () => {
        processManager.off("output", onOutput);
        processManager.off("status", onStatus);
      });
    },
  );

  app.get(
    "/events",
    { websocket: true },
    (socket, request) => {
      if (!isDaemonAuthorized(request)) {
        sendJson(socket, { type: "error", message: "Unauthorized" });
        socket.close();
        return;
      }

      sendJson(socket, { type: "hello", daemonVersion: daemonConfig.version });

      const onStatus = (
        serverId: string,
        status: string,
        errorMessage: string | null,
      ) => {
        sendJson(socket, {
          type: "status",
          serverId,
          status,
          errorMessage,
        });
      };

      const onPlayers = (serverId: string, players: string[]) => {
        sendJson(socket, { type: "players", serverId, players });
      };

      const onOutput = (
        serverId: string,
        line: string,
        stream: "stdout" | "stderr",
      ) => {
        sendJson(socket, { type: "output", serverId, line, stream });
      };

      const onStats = (serverId: string, stats: unknown) => {
        sendJson(socket, { type: "stats", serverId, stats });
      };

      processManager.on("status", onStatus);
      processManager.on("players", onPlayers);
      processManager.on("output", onOutput);
      processManager.on("stats", onStats);

      // Push current cached samples so the panel does not wait for the next frame
      for (const [serverId, stats] of Object.entries(resourceMonitor.listCached())) {
        sendJson(socket, { type: "stats", serverId, stats });
      }

      socket.on("close", () => {
        processManager.off("status", onStatus);
        processManager.off("players", onPlayers);
        processManager.off("output", onOutput);
        processManager.off("stats", onStats);
      });
    },
  );

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

  try {
    sftpHandle = await startSftpServer(sftpConfigFromEnv(daemonConfig.token));
    if (sftpHandle.listening) {
      app.log.info(`SFTP listening on 0.0.0.0:${sftpHandle.port}`);
    }
  } catch (err) {
    app.log.error(err, "Failed to start SFTP server");
  }

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
