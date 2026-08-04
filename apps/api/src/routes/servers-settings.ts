import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ServerType } from "@msm/shared";
import { hasPermission } from "@msm/shared";
import { requireServerAccess } from "../auth.js";
import { logActivity } from "../activity-log.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  assertSafeBrowserUrl,
  assertSafeOutboundUrl,
  assertSafeWebhookUrl,
  DISCORD_WEBHOOK_HOST_SUFFIXES,
} from "../safe-url.js";
import {
  changeFirewallPort,
  closeFirewallPort,
  openFirewallPort,
} from "../firewall.js";
import {
  readPlayers,
} from "../players.js";
import { processManager } from "../process-manager.js";
import { readServerProperties, updateServerProperties } from "../properties.js";
import { serverListInclude, toMcServer, toServerDetail } from "../serialize.js";
import {
  applyServerUpdate,
  checkServerUpdate,
} from "../updates.js";
import {
  applyVersionChangeViaRuntime,
  changeServerType,
  changeTypeRequiresWipeAddons,
  reinstallServer,
} from "../server-lifecycle.js";

const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
] as const;


const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  javaVersion: z
    .enum(["8", "11", "17", "21", "25"])
    .nullable()
    .optional(),
  startupCommand: z.string().max(4000).nullable().optional(),
  serverJar: z.string().min(1).max(128).nullable().optional(),
  javaPath: z.string().nullable().optional(),
  properties: z.record(z.string()).optional(),
  autoRestart: z.boolean().optional(),
  startOnBoot: z.boolean().optional(),
  ownerAlertWebhookUrl: z
    .union([z.string().url().max(500), z.literal(""), z.null()])
    .optional(),
  ownerAlertEmail: z
    .union([z.string().email().max(255), z.literal(""), z.null()])
    .optional(),
  discordStatusWebhookUrl: z
    .union([z.string().url().max(500), z.literal(""), z.null()])
    .optional(),
  discordStatusEnabled: z.boolean().optional(),
  bluemapUrl: z.union([z.string().url().max(500), z.literal(""), z.null()]).optional(),
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
  ownerId: z.string().nullable().optional(),
});


/** Settings / lifecycle / engine / proxy routes (split from servers.ts). */
export function registerServerSettingsRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/updates", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    try {
      return await checkServerUpdate(access.server);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { mcVersion?: string };
  }>("/api/servers/:id/update", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    try {
      const result = request.body?.mcVersion
        ? await applyVersionChangeViaRuntime(
            access.server.id,
            request.body.mcVersion,
          )
        : await applyServerUpdate(access.server.id, request.body?.mcVersion);
      logActivity({
        action: "server.version-change",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          from: access.server.mcVersion,
          to: result.server.mcVersion,
          type: result.server.type,
        },
      });
      return {
        server: toMcServer(result.server),
        update: result.update,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.version-change",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, requested: request.body?.mcVersion },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { keepWorld?: boolean; keepAddons?: boolean };
  }>("/api/servers/:id/reinstall", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const keepWorld = request.body?.keepWorld !== false;
    const keepAddons = request.body?.keepAddons !== false;
    try {
      const server = await reinstallServer(access.server.id, { keepWorld, keepAddons });
      logActivity({
        action: "server.reinstall",
        request,
        user: access.user,
        server: access.server,
        metadata: { keepWorld, keepAddons },
      });
      return { server: toMcServer(server) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.reinstall",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, keepWorld, keepAddons },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { type?: string; mcVersion?: string; wipeAddons?: boolean };
  }>("/api/servers/:id/change-type", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const type = (request.body?.type ?? "").toUpperCase();
    const mcVersion = request.body?.mcVersion?.trim() ?? "";
    if (!(SERVER_TYPES as readonly string[]).includes(type)) {
      return reply.status(400).send({ error: "Invalid type" });
    }
    if (!mcVersion) {
      return reply.status(400).send({ error: "mcVersion is required" });
    }
    const wipeAddons =
      request.body?.wipeAddons === true ||
      changeTypeRequiresWipeAddons(
        access.server.type as ServerType,
        type as ServerType,
      );
    try {
      const server = await changeServerType(access.server.id, {
        type: type as ServerType,
        mcVersion,
        wipeAddons,
      });
      logActivity({
        action: "server.type-change",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          from: access.server.type,
          to: type,
          mcVersion,
          wipeAddons,
        },
      });
      return { server: toMcServer(server) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.type-change",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, type, mcVersion },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.patch<{ Params: { id: string } }>("/api/servers/:id", async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const access = await requireServerAccess(request, reply, request.params.id);
    if (!access) return;
    const server = access.server;
    const data = parsed.data;

    const needsSettings =
      data.name !== undefined ||
      data.properties !== undefined ||
      data.port !== undefined ||
      data.diskMb !== undefined ||
      data.cpuLimit !== undefined ||
      data.ownerAlertWebhookUrl !== undefined ||
      data.ownerAlertEmail !== undefined ||
      data.discordStatusWebhookUrl !== undefined ||
      data.discordStatusEnabled !== undefined ||
      data.bluemapUrl !== undefined ||
      data.extraMounts !== undefined;
    const needsStartup =
      data.memoryMb !== undefined ||
      data.javaPath !== undefined ||
      data.javaVersion !== undefined ||
      data.startupCommand !== undefined ||
      data.serverJar !== undefined ||
      data.autoRestart !== undefined ||
      data.startOnBoot !== undefined;

    if (needsSettings && !hasPermission(access.permissions, "settings.update")) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    if (needsStartup && !hasPermission(access.permissions, "startup.update")) {
      return reply.status(403).send({ error: "Missing permission" });
    }

    if (data.ownerId !== undefined) {
      if (access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can reassign ownership" });
      }
      if (data.ownerId !== null) {
        const owner = await prisma.user.findUnique({ where: { id: data.ownerId } });
        if (!owner) return reply.status(400).send({ error: "Owner user not found" });
        if (data.ownerId !== server.ownerId) {
          try {
            const { assertCanAllocateMemory } = await import("../quotas.js");
            await assertCanAllocateMemory(
              owner,
              data.memoryMb ?? server.memoryMb,
              { extraServer: true },
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.status(403).send({ error: message });
          }
        }
      }
    }

    if (data.memoryMb !== undefined && data.memoryMb !== server.memoryMb) {
      if (access.user.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Only admins can change server memory" });
      }
      const ownerId = data.ownerId !== undefined ? data.ownerId : server.ownerId;
      if (ownerId) {
        const owner =
          ownerId === access.user.id
            ? access.user
            : await prisma.user.findUnique({ where: { id: ownerId } });
        if (owner) {
          try {
            const { assertCanAllocateMemory } = await import("../quotas.js");
            await assertCanAllocateMemory(owner, data.memoryMb, {
              excludeServerId: server.id,
              diskMb: data.diskMb ?? server.diskMb,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.status(403).send({ error: message });
          }
        }
      }

      if (server.nodeId) {
        try {
          const { assertNodeCapacity } = await import("../nodes.js");
          await assertNodeCapacity(server.nodeId, data.memoryMb, {
            excludeServerId: server.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(403).send({ error: message });
        }
      }
    }

    if (data.diskMb !== undefined && data.diskMb !== server.diskMb) {
      try {
        const { assertLicenseDiskQuota } = await import("../license.js");
        await assertLicenseDiskQuota(data.diskMb);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(403).send({ error: message });
      }
    }

    const portChanging = data.port !== undefined && data.port !== server.port;

    if (portChanging) {
      if (processManager.isRunning(server.id) || server.status === "RUNNING") {
        return reply.status(409).send({ error: "Stop the server before changing the port" });
      }
      const free = await processManager.isPortFree(data.port!, server.id, server.nodeId);
      if (!free) {
        return reply.status(409).send({ error: `Port ${data.port} is already in use` });
      }
    }

    if (data.properties || data.port !== undefined) {
      await updateServerProperties(
        server.id,
        data.properties ?? {},
        data.port,
      );
    }

    // javaVersion is stored in javaPath (major version string).
    let nextJavaPath: string | null | undefined = undefined;
    if (data.javaVersion !== undefined) {
      nextJavaPath = data.javaVersion;
    } else if (data.javaPath !== undefined) {
      nextJavaPath = data.javaPath;
    }

    if (data.startupCommand !== undefined && data.startupCommand !== null) {
      const trimmed = data.startupCommand.trim();
      if (trimmed) {
        try {
          const {
            resolveStartupCommand,
            startupCommandToArgs,
            normalizeServerJar,
            assertSafeStartupCommand,
          } = await import("@msm/shared");
          const jar = normalizeServerJar(
            data.serverJar !== undefined ? data.serverJar : server.serverJar,
          );
          const mem = data.memoryMb ?? server.memoryMb;
          startupCommandToArgs(resolveStartupCommand(trimmed, mem, jar));
          assertSafeStartupCommand(trimmed, mem, jar);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({ error: `Invalid startup command: ${message}` });
        }
      }
    } else if (
      data.memoryMb !== undefined &&
      data.memoryMb !== server.memoryMb &&
      server.startupCommand?.trim()
    ) {
      // Memory lowered/changed — existing hard-coded -Xmx must still fit.
      try {
        const { assertSafeStartupCommand, normalizeServerJar } = await import(
          "@msm/shared"
        );
        assertSafeStartupCommand(
          server.startupCommand,
          data.memoryMb,
          normalizeServerJar(
            data.serverJar !== undefined ? data.serverJar : server.serverJar,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          error: `Cannot set memory: startup command heap exceeds new limit. ${message}`,
        });
      }
    }

    let nextServerJar: string | null | undefined = undefined;
    if (data.serverJar !== undefined) {
      if (data.serverJar === null || !data.serverJar.trim()) {
        nextServerJar = null;
      } else {
        try {
          const { normalizeServerJar } = await import("@msm/shared");
          nextServerJar = normalizeServerJar(data.serverJar);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({ error: message });
        }
      }
    }

    let ownerAlertWebhookUrl: string | null | undefined =
      data.ownerAlertWebhookUrl === undefined
        ? undefined
        : data.ownerAlertWebhookUrl === null || data.ownerAlertWebhookUrl === ""
          ? null
          : data.ownerAlertWebhookUrl.trim();
    let discordStatusWebhookUrl: string | null | undefined =
      data.discordStatusWebhookUrl === undefined
        ? undefined
        : data.discordStatusWebhookUrl === null ||
            data.discordStatusWebhookUrl === ""
          ? null
          : data.discordStatusWebhookUrl.trim();
    let bluemapUrl: string | null | undefined =
      data.bluemapUrl === undefined
        ? undefined
        : data.bluemapUrl === null || data.bluemapUrl === ""
          ? null
          : data.bluemapUrl.trim();

    let nextExtraMounts:
      | import("@msm/shared").ServerExtraMount[]
      | null
      | undefined;
    if (data.extraMounts !== undefined) {
      try {
        const { parseExtraMounts } = await import("../extra-mounts.js");
        nextExtraMounts = parseExtraMounts(data.extraMounts);
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : "Invalid extraMounts",
        });
      }
    }

    try {
      if (typeof ownerAlertWebhookUrl === "string") {
        ownerAlertWebhookUrl = await assertSafeWebhookUrl(ownerAlertWebhookUrl);
      }
      if (typeof discordStatusWebhookUrl === "string") {
        discordStatusWebhookUrl = await assertSafeOutboundUrl(
          discordStatusWebhookUrl,
          {
            httpsOnly: true,
            allowedHostSuffixes: DISCORD_WEBHOOK_HOST_SUFFIXES,
          },
        );
      }
      if (typeof bluemapUrl === "string") {
        bluemapUrl = assertSafeBrowserUrl(bluemapUrl);
      }
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : "Invalid URL",
      });
    }

    const { extraMountsForPrisma } = await import("../extra-mounts.js");

    const updated = await prisma.server.update({
      where: { id: server.id },
      data: {
        name: data.name,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        port: data.port,
        javaPath: nextJavaPath,
        startupCommand:
          data.startupCommand === undefined
            ? undefined
            : data.startupCommand === null || !data.startupCommand.trim()
              ? null
              : data.startupCommand.trim(),
        serverJar: nextServerJar,
        autoRestart: data.autoRestart,
        startOnBoot: data.startOnBoot,
        ownerAlertWebhookUrl,
        ownerAlertEmail:
          data.ownerAlertEmail === undefined
            ? undefined
            : data.ownerAlertEmail === null || data.ownerAlertEmail === ""
              ? null
              : data.ownerAlertEmail.trim().toLowerCase(),
        discordStatusWebhookUrl,
        discordStatusEnabled: data.discordStatusEnabled,
        bluemapUrl,
        ...(nextExtraMounts !== undefined
          ? { extraMounts: extraMountsForPrisma(nextExtraMounts) }
          : {}),
        ownerId: data.ownerId === undefined ? undefined : data.ownerId,
      },
      include: serverListInclude,
    });

    if (data.diskMb !== undefined || data.cpuLimit !== undefined) {
      try {
        const { daemonSetLimits } = await import("../daemon-client.js");
        await daemonSetLimits(server.id, {
          diskMb: updated.diskMb,
          cpuLimit: updated.cpuLimit,
        });
      } catch {
        // applied again on next start
      }
    }

    if (portChanging) {
      try {
        await changeFirewallPort(server.port, data.port!, server.nodeId);
        if (server.nodeId) {
          const { ensurePrimaryAllocation } = await import("../allocations.js");
          await ensurePrimaryAllocation({
            serverId: server.id,
            nodeId: server.nodeId,
            port: data.port!,
          });
        }
      } catch (err) {
        await prisma.server.update({
          where: { id: server.id },
          data: { port: server.port },
        });
        await updateServerProperties(server.id, {}, server.port);
        await closeFirewallPort(data.port!, server.nodeId).catch(() => undefined);
        await openFirewallPort(server.port, server.nodeId).catch(() => undefined);
        if (server.nodeId) {
          const { ensurePrimaryAllocation } = await import("../allocations.js");
          await ensurePrimaryAllocation({
            serverId: server.id,
            nodeId: server.nodeId,
            port: server.port,
          }).catch(() => undefined);
        }
        const message = err instanceof Error ? err.message : String(err);
        return reply
          .status(500)
          .send({ error: `Firewall update failed: ${message}` });
      }

      if (updated.subdomain) {
        try {
          const { ensureServerSubdomain, cloudflareConfigured } = await import(
            "../cloudflare-dns.js"
          );
          if (cloudflareConfigured()) {
            const { hostPublicIp } = await import("../host-resources.js");
            const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)
              ? config.publicHost
              : hostPublicIp();
            if (!ipv4) throw new Error("No public IPv4 available for Cloudflare A record");
            const slug = updated.subdomain!;
            await ensureServerSubdomain({
              preferredSlug: slug,
              currentSlug: slug,
              port: data.port!,
              ipv4,
            });
          }
        } catch (dnsErr) {
          const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
          console.warn(`[guartrix] Cloudflare SRV update failed: ${msg}`);
        }
      }
    }

    const changedFields = (
      [
        "name",
        "memoryMb",
        "diskMb",
        "cpuLimit",
        "port",
        "javaVersion",
        "javaPath",
        "startupCommand",
        "serverJar",
        "autoRestart",
        "startOnBoot",
        "extraMounts",
      ] as const
    ).filter((key) => data[key] !== undefined);

    if (changedFields.length > 0) {
      logActivity({
        action: needsStartup ? "settings.startup" : "settings.update",
        request,
        user: access.user,
        server: updated,
        metadata: {
          fields: [...changedFields],
          ...(data.name !== undefined && data.name !== server.name
            ? { renamedFrom: server.name }
            : {}),
          ...(portChanging ? { fromPort: server.port, toPort: updated.port } : {}),
        },
      });
    }
    if (data.properties && Object.keys(data.properties).length > 0) {
      logActivity({
        action: "settings.properties",
        request,
        user: access.user,
        server: updated,
        metadata: { keys: Object.keys(data.properties) },
      });
    }
    if (data.ownerId !== undefined && data.ownerId !== server.ownerId) {
      logActivity({
        action: "server.owner-change",
        request,
        user: access.user,
        server: updated,
        metadata: { fromOwnerId: server.ownerId, toOwnerId: data.ownerId },
      });
    }

    const properties = await readServerProperties(updated.id);
    const players = await readPlayers(updated.id);

    // Live whitelist toggle when server is running
    if (
      data.properties?.["white-list"] !== undefined &&
      processManager.isRunning(updated.id)
    ) {
      const on = data.properties["white-list"] === "true";
      try {
        processManager.sendCommand(updated.id, on ? "whitelist on" : "whitelist off");
      } catch {
        // ignore
      }
    }

    return toServerDetail(updated, properties, players);
  });


  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/engine",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.read",
      });
      if (!access) return;
      const { getEngineSettings } = await import("../engine-config.js");
      return getEngineSettings(access.server.id, access.server.type as ServerType);
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { updates?: Record<string, boolean | number | string> };
  }>("/api/servers/:id/engine", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const updates = request.body?.updates ?? {};
    try {
      const { updateEngineSettings } = await import("../engine-config.js");
      const result = await updateEngineSettings(
        access.server.id,
        access.server.type as ServerType,
        updates,
      );
      logActivity({
        action: "settings.engine",
        request,
        user: access.user,
        server: access.server,
        metadata: { keys: Object.keys(updates) },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/console-favorites",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "control.console",
      });
      if (!access) return;
      const { getConsoleFavorites } = await import("../console-favorites.js");
      return { commands: await getConsoleFavorites(access.server.id) };
    },
  );

  app.put<{ Params: { id: string }; Body: { commands?: string[] } }>(
    "/api/servers/:id/console-favorites",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "control.console",
      });
      if (!access) return;
      const commands = Array.isArray(request.body?.commands)
        ? request.body!.commands!
        : [];
      const { setConsoleFavorites } = await import("../console-favorites.js");
      return { commands: await setConsoleFavorites(access.server.id, commands) };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/proxy",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.read",
      });
      if (!access) return;
      const { getProxySetup } = await import("../proxy-setup.js");
      return getProxySetup(access.server.id, access.server.type as ServerType);
    },
  );

  app.post<{
    Params: { id: string };
    Body: { mode?: "none" | "velocity" | "bungeecord" };
  }>("/api/servers/:id/proxy", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const mode = request.body?.mode ?? "none";
    if (!["none", "velocity", "bungeecord"].includes(mode)) {
      return reply.status(400).send({ error: "Invalid proxy mode" });
    }
    try {
      const { applyProxySetup } = await import("../proxy-setup.js");
      const result = await applyProxySetup(
        access.server.id,
        access.server.type as ServerType,
        mode,
      );
      logActivity({
        action: "settings.engine",
        request,
        user: access.user,
        server: access.server,
        metadata: { proxyMode: mode },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
