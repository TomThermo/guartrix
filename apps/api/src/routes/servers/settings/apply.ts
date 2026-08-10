import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerType } from "@guartrix/shared";
import { isBdsServerType } from "@guartrix/shared";
import { logActivity } from "../../../activity-log.js";
import { config } from "../../../config.js";
import { prisma } from "../../../db.js";
import { errorMessage } from "../../../http-error.js";
import {
  changeFirewallPort,
  closeFirewallPort,
  openFirewallPort,
} from "../../../nodes/firewall.js";
import { readPlayers } from "../../../servers/players.js";
import { processManager } from "../../../servers/process-manager.js";
import { readServerProperties, updateServerProperties } from "../../../servers/properties.js";
import {
  invalidateServerListFsMeta,
  serverListInclude,
  toServerDetail,
} from "../../../servers/serialize.js";
import { patchNeedsStartup } from "./guards.js";
import type { ServerSettingsPatch } from "./schemas.js";
import type { NormalizedSettingsFields } from "./validate.js";

type Access = NonNullable<
  Awaited<ReturnType<typeof import("../../../auth/auth.js").requireServerAccess>>
>;

export async function applyServerSettingsPatch(
  request: FastifyRequest,
  reply: FastifyReply,
  access: Access,
  data: ServerSettingsPatch,
  fields: NormalizedSettingsFields,
): Promise<unknown> {
  const server = access.server;
  const {
    portChanging,
    portProtocol,
    nextJavaPath,
    nextServerJar,
    ownerAlertWebhookUrl,
    discordStatusWebhookUrl,
    bluemapUrl,
    nextExtraMounts,
  } = fields;

  const { extraMountsForPrisma } = await import("../../../servers/extra-mounts.js");

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
      const { daemonSetLimits } = await import("../../../nodes/daemon-client.js");
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
      await changeFirewallPort(server.port, data.port!, server.nodeId, portProtocol);
      if (server.nodeId) {
        const { ensurePrimaryAllocation } = await import("../../../servers/allocations.js");
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
      await closeFirewallPort(data.port!, server.nodeId, portProtocol).catch(() => undefined);
      await openFirewallPort(server.port, server.nodeId, portProtocol).catch(() => undefined);
      if (server.nodeId) {
        const { ensurePrimaryAllocation } = await import("../../../servers/allocations.js");
        await ensurePrimaryAllocation({
          serverId: server.id,
          nodeId: server.nodeId,
          port: server.port,
          protocol: portProtocol,
        }).catch(() => undefined);
      }
      return reply.status(500).send({ error: `Firewall update failed: ${errorMessage(err)}` });
    }

    if (updated.subdomain) {
      try {
        const { ensureServerSubdomain, cloudflareConfigured } = await import(
          "../../../nodes/cloudflare-dns.js"
        );
        if (cloudflareConfigured()) {
          const { hostPublicIp } = await import("../../../nodes/host-resources.js");
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

  const needsStartup = patchNeedsStartup(data);

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
  if (data.properties?.["white-list"] !== undefined && processManager.isRunning(updated.id)) {
    const on = data.properties["white-list"] === "true";
    const isBds = isBdsServerType(updated.type as ServerType);
    try {
      processManager.sendCommand(
        updated.id,
        on ? (isBds ? "allowlist on" : "whitelist on") : isBds ? "allowlist off" : "whitelist off",
      );
    } catch {
      // ignore
    }
  }

  return toServerDetail(updated, properties, players);
}
