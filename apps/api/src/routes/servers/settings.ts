import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ServerType } from "@msm/shared";
import { hasPermission, isBdsServerType, primaryAllocationProtocol } from "@msm/shared";
import { assertAdminFullApiKey, requireServerAccess } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { errorMessage, sendZodError } from "../../http-error.js";
import {
  assertSafeBrowserUrl,
  assertSafeOutboundUrl,
  assertSafeWebhookUrl,
  DISCORD_WEBHOOK_HOST_SUFFIXES,
} from "../../safe-url.js";
import {
  changeFirewallPort,
  closeFirewallPort,
  openFirewallPort,
} from "../../nodes/firewall.js";
import {
  readPlayers,
} from "../../servers/players.js";
import { processManager } from "../../servers/process-manager.js";
import { readServerProperties, updateServerProperties } from "../../servers/properties.js";
import { serverListInclude, toMcServer, toServerDetail, invalidateServerListFsMeta } from "../../servers/serialize.js";

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
  suspended: z.boolean().optional(),
});


/** PATCH /api/servers/:id — core server settings. */
export function registerServerSettingsRoutes(app: FastifyInstance): void {
  app.patch<{ Params: { id: string } }>("/api/servers/:id", async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
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
      data.bluemapUrl !== undefined;
    const needsStartup =
      data.memoryMb !== undefined ||
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

    if (data.extraMounts !== undefined) {
      if (access.user.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Only admins can change extra host mounts" });
      }
      if (!assertAdminFullApiKey(request, reply)) return;
    }

    if (data.ownerId !== undefined) {
      if (access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can reassign ownership" });
      }
      if (!assertAdminFullApiKey(request, reply)) return;
      if (data.ownerId !== null) {
        const owner = await prisma.user.findUnique({ where: { id: data.ownerId } });
        if (!owner) return reply.status(400).send({ error: "Owner user not found" });
        if (data.ownerId !== server.ownerId) {
          try {
            const { assertCanAllocateMemory } = await import("../../billing/quotas.js");
            await assertCanAllocateMemory(
              owner,
              data.memoryMb ?? server.memoryMb,
              { extraServer: true },
            );
          } catch (err) {
            const message = errorMessage(err);
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
      if (!assertAdminFullApiKey(request, reply)) return;
      const ownerId = data.ownerId !== undefined ? data.ownerId : server.ownerId;
      if (ownerId) {
        const owner =
          ownerId === access.user.id
            ? access.user
            : await prisma.user.findUnique({ where: { id: ownerId } });
        if (owner) {
          try {
            const { assertCanAllocateMemory } = await import("../../billing/quotas.js");
            await assertCanAllocateMemory(owner, data.memoryMb, {
              excludeServerId: server.id,
              diskMb: data.diskMb ?? server.diskMb,
            });
          } catch (err) {
            const message = errorMessage(err);
            return reply.status(403).send({ error: message });
          }
        }
      }

      if (server.nodeId) {
        try {
          const { assertNodeCapacity } = await import("../../nodes/nodes.js");
          await assertNodeCapacity(server.nodeId, data.memoryMb, {
            excludeServerId: server.id,
          });
        } catch (err) {
          const message = errorMessage(err);
          return reply.status(403).send({ error: message });
        }
      }
    }

    if (data.diskMb !== undefined && data.diskMb !== server.diskMb) {
      if (access.user.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Only admins can change server disk quota" });
      }
      if (!assertAdminFullApiKey(request, reply)) return;
      try {
        const { assertLicenseDiskQuota } = await import("../../license/license.js");
        await assertLicenseDiskQuota(data.diskMb);
      } catch (err) {
        const message = errorMessage(err);
        return reply.status(403).send({ error: message });
      }
    }

    if (data.cpuLimit !== undefined && data.cpuLimit !== server.cpuLimit) {
      if (access.user.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Only admins can change server CPU limit" });
      }
      if (!assertAdminFullApiKey(request, reply)) return;
    }

    if (data.suspended !== undefined) {
      if (access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can suspend servers" });
      }
      if (!assertAdminFullApiKey(request, reply)) return;
      if (data.suspended === true && processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }
    }

    const portChanging = data.port !== undefined && data.port !== server.port;

    const portProtocol = primaryAllocationProtocol(
      server.type as ServerType,
    );

    if (portChanging) {
      if (processManager.isRunning(server.id) || server.status === "RUNNING") {
        return reply.status(409).send({ error: "Stop the server before changing the port" });
      }
      const free = await processManager.isPortFree(
        data.port!,
        server.id,
        server.nodeId,
        portProtocol,
      );
      if (!free) {
        return reply.status(409).send({
          error: `Port ${data.port}/${portProtocol} is already in use`,
        });
      }
    }

    if (data.properties || data.port !== undefined) {
      await updateServerProperties(
        server.id,
        data.properties ?? {},
        data.port,
      );
    }

    // javaVersion is stored in the javaPath DB column (major version string).
    let nextJavaPath: string | null | undefined = undefined;
    if (data.javaVersion !== undefined) {
      nextJavaPath = data.javaVersion;
    }

    if (data.startupCommand !== undefined && data.startupCommand !== null) {
      const trimmed = data.startupCommand.trim();
      if (trimmed) {
        try {
          const {
            resolveStartupCommand,
            startupCommandToArgs,
            normalizeServerExecutable,
            assertSafeStartupCommandForType,
          } = await import("@msm/shared");
          const jar = normalizeServerExecutable(
            data.serverJar !== undefined ? data.serverJar : server.serverJar,
            server.type as ServerType,
          );
          const mem = data.memoryMb ?? server.memoryMb;
          startupCommandToArgs(resolveStartupCommand(trimmed, mem, jar));
          assertSafeStartupCommandForType(
            server.type as ServerType,
            trimmed,
            mem,
            jar,
          );
        } catch (err) {
          const message = errorMessage(err);
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
        const {
          assertSafeStartupCommandForType,
          normalizeServerExecutable,
        } = await import("@msm/shared");
        assertSafeStartupCommandForType(
          server.type as ServerType,
          server.startupCommand,
          data.memoryMb,
          normalizeServerExecutable(
            data.serverJar !== undefined ? data.serverJar : server.serverJar,
            server.type as ServerType,
          ),
        );
      } catch (err) {
        const message = errorMessage(err);
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
          const { normalizeServerExecutable } = await import("@msm/shared");
          nextServerJar = normalizeServerExecutable(
            data.serverJar,
            server.type as ServerType,
          );
        } catch (err) {
          const message = errorMessage(err);
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
        const { parseExtraMounts } = await import("../../servers/extra-mounts.js");
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

    const { extraMountsForPrisma } = await import("../../servers/extra-mounts.js");

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
        suspended: data.suspended,
      },
      include: serverListInclude,
    });

    if (data.diskMb !== undefined || data.cpuLimit !== undefined) {
      try {
        const { daemonSetLimits } = await import("../../nodes/daemon-client.js");
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
        await changeFirewallPort(
          server.port,
          data.port!,
          server.nodeId,
          portProtocol,
        );
        if (server.nodeId) {
          const { ensurePrimaryAllocation } = await import("../../servers/allocations.js");
          await ensurePrimaryAllocation({
            serverId: server.id,
            nodeId: server.nodeId,
            port: data.port!,
            protocol: portProtocol,
          });
        }
      } catch (err) {
        await prisma.server.update({
          where: { id: server.id },
          data: { port: server.port },
        });
        await updateServerProperties(server.id, {}, server.port);
        await closeFirewallPort(data.port!, server.nodeId, portProtocol).catch(
          () => undefined,
        );
        await openFirewallPort(server.port, server.nodeId, portProtocol).catch(
          () => undefined,
        );
        if (server.nodeId) {
          const { ensurePrimaryAllocation } = await import("../../servers/allocations.js");
          await ensurePrimaryAllocation({
            serverId: server.id,
            nodeId: server.nodeId,
            port: server.port,
            protocol: portProtocol,
          }).catch(() => undefined);
        }
        const message = errorMessage(err);
        return reply
          .status(500)
          .send({ error: `Firewall update failed: ${message}` });
      }

      if (updated.subdomain) {
        try {
          const { ensureServerSubdomain, cloudflareConfigured } = await import(
            "../../nodes/cloudflare-dns.js"
          );
          if (cloudflareConfigured()) {
            const { hostPublicIp } = await import("../../nodes/host-resources.js");
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
      if (
        data.properties["white-list"] !== undefined ||
        data.properties["allow-list"] !== undefined
      ) {
        invalidateServerListFsMeta(updated.id);
      }
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
      const isBds = isBdsServerType(updated.type as ServerType);
      try {
        processManager.sendCommand(
          updated.id,
          on
            ? isBds
              ? "allowlist on"
              : "whitelist on"
            : isBds
              ? "allowlist off"
              : "whitelist off",
        );
      } catch {
        // ignore
      }
    }

    return toServerDetail(updated, properties, players);
  });

}
