import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../../../auth/auth.js";
import { userHasServerPermission } from "../../../servers/server-access.js";
import { config } from "../../../config.js";
import { readPlayers } from "../../../servers/players.js";
import { getOnlinePlayers } from "../../../servers/online-players.js";
import { processManager } from "../../../servers/process-manager.js";
import { readServerProperties } from "../../../servers/properties.js";
import { serverListInclude, toServerDetail } from "../../../servers/serialize.js";
import { collectServerStats } from "../../../servers/stats.js";
import { findFirstNode, findNode } from "../../../repositories/nodes.js";
import { findServerOrThrow, updateServer } from "../../../repositories/servers.js";

export function registerServerReadRoutes(app: FastifyInstance): void {
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

  app.get<{ Params: { id: string } }>("/api/servers/:id/stats/history", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id);
    if (!access) return;
    try {
      const { daemonStatsHistory } = await import("../../../nodes/daemon-client.js");
      const data = await daemonStatsHistory(access.server.id);
      return { samples: data.samples ?? [] };
    } catch {
      // Daemon unreachable or older node without history route — empty ring.
      return { samples: [] };
    }
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/online", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.read",
    });
    if (!access) return;
    const server = access.server;
    // Refresh tracked list via /list once the JVM is fully ready (no artificial wait —
    // console parse + daemon cache catch up on the next poll).
    if (processManager.isRunning(server.id) && processManager.getStatus(server.id) === "RUNNING") {
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
    let server = await findServerOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    // Heal leftover ERROR from the old "Start while already running" path.
    if (server.status === "ERROR" && /already running/i.test(server.errorMessage ?? "")) {
      const up =
        processManager.isRunning(server.id) || (await processManager.refreshRunning(server.id));
      if (up) {
        processManager.applyStatus(server.id, "RUNNING", null);
        server = await updateServer({
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
      isOwner: access.user.role === "ADMIN" || access.server.ownerId === access.user.id,
      permissions: access.permissions,
    };
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/connect", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "allocation.read",
    });
    if (!access) return;
    const server = access.server;
    const properties = await readServerProperties(server.id);
    const { hostPublicIp } = await import("../../../nodes/host-resources.js");
    const publicIp = hostPublicIp();
    const directIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)
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
      ? await findNode({ where: { id: server.nodeId } })
      : await findFirstNode({ where: { isLocal: true } });

    const canSftp = await userHasServerPermission(access.user, server, "file.sftp");
    const { nodeSftpDisplayHost } = await import("../../../nodes/nodes.js");
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
      sftpUsername: sftpEnabled ? `${access.user.username}.${server.id}` : null,
    };
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/disk", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    const { daemonDisk } = await import("../../../nodes/daemon-client.js");
    return daemonDisk(access.server.id);
  });
}
