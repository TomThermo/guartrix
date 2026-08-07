import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { ServerType } from "@msm/shared";
import { primaryAllocationProtocol } from "@msm/shared";
import { safeExtractArchive } from "@msm/node-agent";
import {
  assertAdminFullApiKey,
  requireServerAccess,
  requireWrite,
  verifyAccountPassword,
} from "../../auth/auth.js";
import { userHasServerPermission } from "../../servers/server-access.js";
import { logActivity } from "../../activity-log.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { destroyServerDatabases } from "./databases.js";
import {
  openFirewallPort,
} from "../../nodes/firewall.js";
import {
  readPlayers,
} from "../../servers/players.js";
import { listVersions } from "../../providers/jars.js";
import { getOnlinePlayers } from "../../servers/online-players.js";
import { processManager } from "../../servers/process-manager.js";
import { readServerProperties, updateServerProperties } from "../../servers/properties.js";
import {
  syncLocalDirToNode,
  wipeServerEverywhere,
} from "../../servers/server-files.js";
import { serverListInclude, toMcServer, toServerDetail } from "../../servers/serialize.js";
import { collectServerStats } from "../../servers/stats.js";
import {
  applyCreateWorldDefaults,
} from "../../servers/server-lifecycle.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
] as const;


const createSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(SERVER_TYPES),
  mcVersion: z.string().min(1),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
  seed: z.string().max(128).optional(),
  gamemode: z.enum(["survival", "creative", "adventure", "spectator"]).optional(),
  difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
  worldPreset: z.enum(["DEFAULT", "FLAT", "VOID"]).optional(),
  keepCount: z.number().int().min(1).max(50).optional(),
  extraMounts: z
    .array(
      z.object({
        host: z.string().min(1).max(512),
        container: z.string().min(1).max(512),
        readOnly: z.boolean().optional(),
      }),
    )
    .max(8)
    .nullable()
    .optional(),
});


const cloneSchema = z.object({
  name: z.string().min(1).max(64),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
});


/** CRUD + stats/connect/disk/clone routes (split from servers.ts). */
export function registerServerCrudRoutes(app: FastifyInstance): void {
  app.get("/api/servers/create-defaults", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;
    return { defaultBackupKeepCount: config.defaultBackupKeepCount };
  });

  app.get<{ Params: { id: string }; Querystring: { disk?: string } }>(
    "/api/servers/:id/stats",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id);
      if (!access) return;
      return collectServerStats(access.server.id, {
        includeDisk: request.query.disk === "1" || request.query.disk === "true",
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/stats/history",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id);
      if (!access) return;
      try {
        const { daemonStatsHistory } = await import("../../nodes/daemon-client.js");
        const data = await daemonStatsHistory(access.server.id);
        return { samples: data.samples ?? [] };
      } catch {
        // Daemon unreachable or older node without history route — empty ring.
        return { samples: [] };
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/servers/:id/online", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.read",
    });
    if (!access) return;
    const server = access.server;
    // Refresh tracked list via /list once the JVM is fully ready (no artificial wait —
    // console parse + daemon cache catch up on the next poll).
    if (
      processManager.isRunning(server.id) &&
      processManager.getStatus(server.id) === "RUNNING"
    ) {
      try {
        processManager.sendCommand(server.id, "list");
      } catch {
        // ignore
      }
    }
    return getOnlinePlayers(server.id);
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id);
    if (!access) return;
    let server = await prisma.server.findUniqueOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    // Heal leftover ERROR from the old "Start while already running" path.
    if (
      server.status === "ERROR" &&
      /already running/i.test(server.errorMessage ?? "")
    ) {
      const up =
        processManager.isRunning(server.id) ||
        (await processManager.refreshRunning(server.id));
      if (up) {
        processManager.applyStatus(server.id, "RUNNING", null);
        server = await prisma.server.update({
          where: { id: server.id },
          data: { status: "RUNNING", errorMessage: null },
          include: serverListInclude,
        });
      }
    }
    const properties = await readServerProperties(server.id);
    const players = await readPlayers(server.id);
    const detail = toServerDetail(server, properties, players);
    return {
      ...detail,
      isOwner:
        access.user.role === "ADMIN" || access.server.ownerId === access.user.id,
      permissions: access.permissions,
    };
  });

  app.post("/api/servers", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;

    let validatedExtraMounts:
      | import("@msm/shared").ServerExtraMount[]
      | null
      | undefined;
    if (data.extraMounts !== undefined) {
      try {
        const { parseExtraMounts } = await import("../../servers/extra-mounts.js");
        validatedExtraMounts = parseExtraMounts(data.extraMounts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    }

    try {
      const { assertCanCreateServer } = await import("../../billing/quotas.js");
      await assertCanCreateServer(user, data.memoryMb, { diskMb: data.diskMb });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(403).send({ error: message });
    }

    if (data.nodeId && user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Only admins can choose a node" });
    }
    if (data.nodeId && user.role === "ADMIN" && !assertAdminFullApiKey(request, reply)) {
      return;
    }

    let nodeId: string;
    try {
      const { assertNodeCapacity, resolveCreateNodeId } = await import(
        "../../nodes/nodes.js"
      );
      nodeId = await resolveCreateNodeId(
        user.role === "ADMIN" ? data.nodeId : undefined,
      );
      await assertNodeCapacity(nodeId, data.memoryMb, {
        placement: true,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    const { isGamePortAvailable } = await import("../../servers/game-port.js");
    if (!(await isGamePortAvailable(nodeId, data.port, data.type))) {
      const { primaryAllocationProtocol } = await import("@msm/shared");
      const protocol = primaryAllocationProtocol(data.type);
      return reply.status(409).send({
        error: `Port ${data.port}/${protocol} is already in use`,
      });
    }

    try {
      const { provisionPreparedServer, autoStartProvisionedServer } = await import(
        "../../servers/server-provision.js",
      );
      const { server: updated } = await provisionPreparedServer({
        name: data.name,
        type: data.type as ServerType,
        mcVersion: data.mcVersion,
        port: data.port,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        ownerId: user.id,
        nodeId,
        ensureSubdomain: true,
        cleanupOnFailure: true,
        ...(validatedExtraMounts !== undefined
          ? { extraMounts: validatedExtraMounts }
          : {}),
      });

      const preset = data.worldPreset ?? "DEFAULT";
      const levelType =
        preset === "FLAT" ? "flat" : preset === "VOID" ? "flat" : undefined;
      const generatorSettings =
        preset === "VOID"
          ? JSON.stringify({
              layers: [{ block: "minecraft:air", height: 1 }],
              biome: "minecraft:the_void",
            })
          : undefined;
      await applyCreateWorldDefaults(updated.id, {
        seed: data.seed,
        gamemode: data.gamemode,
        difficulty: data.difficulty,
        levelType,
        generatorSettings,
      }).catch((err) => {
        console.warn(
          `[guartrix] create world defaults failed for ${updated.id}:`,
          err instanceof Error ? err.message : err,
        );
      });

      const { applyInitialBackupRetention } = await import(
        "../../servers/backup-schedule.js"
      );
      await applyInitialBackupRetention(updated.id, data.keepCount);

      logActivity({
        action: "server.create",
        request,
        user,
        server: updated,
        metadata: {
          type: updated.type,
          mcVersion: updated.mcVersion,
          port: updated.port,
          memoryMb: updated.memoryMb,
          diskMb: updated.diskMb,
          node: nodeId,
          worldPreset: preset,
        },
      });

      await autoStartProvisionedServer(updated.id);

      const refreshed = await prisma.server.findUniqueOrThrow({
        where: { id: updated.id },
        include: serverListInclude,
      });
      return reply.status(201).send(toMcServer(refreshed));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.create",
        request,
        user,
        serverId: null,
        serverName: data.name,
        success: false,
        metadata: { error: message, type: data.type, port: data.port },
      });
      const status = message.includes("already in use") ? 409 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string }; Body: { password?: string } }>(
    "/api/servers/:id",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const server = access.server;

      const password =
        typeof request.body?.password === "string" ? request.body.password : "";
      if (!password) {
        return reply
          .status(400)
          .send({ error: "Password is required to delete this server" });
      }
      if (!(await verifyAccountPassword(request, password))) {
        return reply.status(403).send({ error: "Incorrect password" });
      }

      if (server.status === "TRANSFERRING" || server.status === "CREATING") {
        return reply
          .status(409)
          .send({ error: "Server is busy — wait for the current operation to finish" });
      }

      if (processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }

      const subdomain = server.subdomain;
      const nodeId = server.nodeId;
      const {
        closeServerAllocationFirewalls,
        releaseServerAllocations,
      } = await import("../../servers/allocations.js");
      await closeServerAllocationFirewalls(server.id, nodeId).catch(() => undefined);
      await destroyServerDatabases(server.id).catch(() => undefined);
      await wipeServerEverywhere(server.id).catch(() => undefined);
      await releaseServerAllocations(server.id).catch(() => undefined);
      await prisma.server.delete({ where: { id: server.id } });
      logActivity({
        action: "server.delete",
        request,
        user: access.user,
        serverId: null,
        serverName: server.name,
        metadata: { serverId: server.id, port: server.port, node: nodeId },
      });
      try {
        const { deleteServerSubdomain } = await import("../../nodes/cloudflare-dns.js");
        await deleteServerSubdomain(subdomain);
      } catch (dnsErr) {
        const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
        console.warn(`[guartrix] Cloudflare subdomain cleanup failed: ${msg}`);
      }
      return reply.status(204).send();
    },
  );

  app.get<{ Querystring: { type?: string } }>("/api/versions", async (request, reply) => {
    const type = (request.query.type ?? "VANILLA").toUpperCase();
    if (!(SERVER_TYPES as readonly string[]).includes(type)) {
      return reply.status(400).send({ error: "Invalid type" });
    }
    try {
      const versions = await listVersions(type as ServerType);
      return { type, versions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/connect", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "allocation.read",
    });
    if (!access) return;
    const server = access.server;
    const properties = await readServerProperties(server.id);
    const { hostPublicIp } = await import("../../nodes/host-resources.js");
    const publicIp = hostPublicIp();
    const directIp =
      /^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)
        ? config.publicHost
        : publicIp;

    let host = config.publicHost;
    let address = `${host}:${server.port}`;
    let subdomainFqdn: string | null = null;
    if (server.subdomain && config.cloudflare.domain) {
      subdomainFqdn = `${server.subdomain}.${config.cloudflare.domain}`;
      host = subdomainFqdn;
      // SRV record lets Java clients connect without :port
      address = subdomainFqdn;
    }

    const node = server.nodeId
      ? await prisma.node.findUnique({ where: { id: server.nodeId } })
      : await prisma.node.findFirst({ where: { isLocal: true } });

    const canSftp = await userHasServerPermission(
      access.user,
      server,
      "file.sftp",
    );
    const { nodeSftpDisplayHost } = await import("../../nodes/nodes.js");
    const sftpHost = node ? nodeSftpDisplayHost(node) : null;
    const sftpPort = node?.sftpPort ?? 2022;
    const sftpEnabled = Boolean(canSftp && sftpHost);

    const maxPlayersRaw = properties["max-players"] ?? "20";
    const playersMax = Math.max(0, Number.parseInt(maxPlayersRaw, 10) || 20);
    const onlineNames = processManager.isRunning(server.id)
      ? processManager.getOnlinePlayerNames(server.id)
      : [];

    return {
      host,
      port: server.port,
      address,
      directIp,
      subdomain: subdomainFqdn,
      motd: properties.motd ?? "A Minecraft Server",
      maxPlayers: maxPlayersRaw,
      onlineMode: properties["online-mode"] !== "false",
      whitelistEnabled: properties["white-list"] === "true",
      mcVersion: server.mcVersion,
      onlinePlayers: onlineNames.length,
      playersMax,
      serverStatus: server.status,
      sftpEnabled,
      sftpHost: sftpEnabled ? sftpHost : null,
      sftpPort: sftpEnabled ? sftpPort : null,
      sftpUsername: sftpEnabled
        ? `${access.user.username}.${server.id}`
        : null,
    };
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/disk", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    const { daemonDisk } = await import("../../nodes/daemon-client.js");
    return daemonDisk(access.server.id);
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/clone",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const source = access.server;
      const parsed = cloneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (processManager.isRunning(source.id)) {
        return reply.status(409).send({ error: "Stop the server before cloning" });
      }
      if (access.user.role === "VIEWER") {
        return reply.status(403).send({ error: "Viewers cannot clone servers" });
      }
      if (parsed.data.nodeId && access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can choose a node" });
      }
      if (
        parsed.data.nodeId &&
        access.user.role === "ADMIN" &&
        !assertAdminFullApiKey(request, reply)
      ) {
        return;
      }
      const memoryMb = parsed.data.memoryMb ?? source.memoryMb;
      const diskMb = parsed.data.diskMb ?? source.diskMb;
      try {
        const { assertCanCreateServer } = await import("../../billing/quotas.js");
        await assertCanCreateServer(access.user, memoryMb, { diskMb });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(403).send({ error: message });
      }

      let nodeId: string;
      try {
        const { assertNodeCapacity, resolveCreateNodeId } = await import(
          "../../nodes/nodes.js"
        );
        nodeId = await resolveCreateNodeId(
          access.user.role === "ADMIN"
            ? (parsed.data.nodeId ?? source.nodeId)
            : source.nodeId,
        );
        await assertNodeCapacity(nodeId, memoryMb, {
          placement: true,
          diskMb,
          cpuLimit: parsed.data.cpuLimit ?? source.cpuLimit,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }

      const protocol = primaryAllocationProtocol(source.type);
      const free = await processManager.isPortFree(
        parsed.data.port,
        undefined,
        nodeId,
        protocol,
      );
      if (!free) {
        return reply.status(409).send({
          error: `Port ${parsed.data.port}/${protocol} is already in use`,
        });
      }

      const id = nanoid(12);
      const destNode = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!destNode) {
        return reply.status(400).send({ error: "Node not found" });
      }

      await prisma.server.create({
        data: {
          id,
          name: parsed.data.name,
          type: source.type,
          mcVersion: source.mcVersion,
          port: parsed.data.port,
          memoryMb,
          diskMb: parsed.data.diskMb ?? source.diskMb,
          cpuLimit: parsed.data.cpuLimit ?? source.cpuLimit,
          status: "CREATING",
          javaPath: source.javaPath,
          startupCommand: source.startupCommand,
          serverJar: source.serverJar,
          fabricLoaderVersion: source.fabricLoaderVersion,
          forgeVersion: source.forgeVersion,
          paperBuild: source.paperBuild,
          autoRestart: source.autoRestart,
          startOnBoot: true,
          ownerId: access.user.id,
          nodeId,
          extraMounts: source.extraMounts ?? undefined,
        },
      });

      const staging = await fs.mkdtemp(
        path.join(os.tmpdir(), `guartrix-clone-${id}-`),
      );
      const { tryEnsureServerSubdomain, cleanupFailedProvision, autoStartProvisionedServer } =
        await import("../../servers/server-provision.js");
      try {
        await openFirewallPort(parsed.data.port, nodeId, protocol);
        const { ensurePrimaryAllocation } = await import("../../servers/allocations.js");
        await ensurePrimaryAllocation({
          serverId: id,
          nodeId,
          port: parsed.data.port,
          protocol,
        });

        // Pull source files via daemon export (stream to disk — avoid OOM on large worlds)
        const archivePath = path.join(staging, "source.tar.gz");
        const { daemonExportArchiveToFile } = await import("../../nodes/daemon-client.js");
        await daemonExportArchiveToFile(source.id, archivePath);
        await safeExtractArchive(archivePath, staging);
        await fs.rm(archivePath, { force: true });
        await fs.rm(path.join(staging, "logs"), { recursive: true, force: true }).catch(() => undefined);
        await fs.rm(path.join(staging, "crash-reports"), { recursive: true, force: true }).catch(() => undefined);
        await fs.rm(path.join(staging, "session.lock"), { force: true }).catch(() => undefined);

        await syncLocalDirToNode(id, nodeId, staging);
        await updateServerProperties(id, {}, parsed.data.port);

        const subdomain = await tryEnsureServerSubdomain(
          parsed.data.name,
          parsed.data.port,
        );

        const updated = await prisma.server.update({
          where: { id },
          data: { status: "STOPPED", errorMessage: null, subdomain },
          include: serverListInclude,
        });
        logActivity({
          action: "server.clone",
          request,
          user: access.user,
          server: updated,
          metadata: {
            clonedFrom: source.name,
            sourceId: source.id,
            port: updated.port,
            node: nodeId,
          },
        });
        await autoStartProvisionedServer(updated.id);
        const refreshed = await prisma.server.findUniqueOrThrow({
          where: { id: updated.id },
          include: serverListInclude,
        });
        return reply.status(201).send(toMcServer(refreshed));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity({
          action: "server.clone",
          request,
          user: access.user,
          server: source,
          success: false,
          metadata: { error: message, name: parsed.data.name },
        });
        await cleanupFailedProvision(id, parsed.data.port, nodeId, protocol);
        return reply.status(500).send({ error: message });
      } finally {
        await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );
}
