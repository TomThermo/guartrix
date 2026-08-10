import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { processManager } from "../../servers/process-manager.js";
import { readServerProperties } from "../../servers/properties.js";
import { requireApplicationServer } from "../../services/application-server-access.js";
import { findFirstNode, findNode } from "../../services/nodes.js";
import { findUser } from "../../services/users.js";

/** Application API connect / SFTP meta (`servers.read` — support tooling). */
export function registerApplicationServerConnectRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/application/servers/:id/connect",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.read",
        request.params.id,
      );
      if (!access) return;
      const server = access.server;
      const properties = await readServerProperties(server.id);
      const { hostPublicIp } = await import("../../nodes/host-resources.js");
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
        address = subdomainFqdn;
      }

      const node = server.nodeId
        ? await findNode({ where: { id: server.nodeId } })
        : await findFirstNode({ where: { isLocal: true } });

      if (!server.ownerId) {
        return reply.status(400).send({ error: "Server has no owner" });
      }
      const owner = await findUser({
        where: { id: server.ownerId },
        select: { username: true },
      });

      const sftpHost = node?.sftpHostname ?? null;
      const sftpPort = node?.sftpPort ?? 2022;
      const ownerUsername = owner?.username ?? null;
      const sftpEnabled = Boolean(sftpHost && ownerUsername);
      const onlineNames = processManager.isRunning(server.id)
        ? processManager.getOnlinePlayerNames(server.id)
        : [];
      const maxPlayersRaw = properties["max-players"] ?? "20";
      const playersMax = Math.max(0, Number.parseInt(maxPlayersRaw, 10) || 20);

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
        sftpUsername: sftpEnabled ? `${ownerUsername}.${server.id}` : null,
      };
    },
  );
}
