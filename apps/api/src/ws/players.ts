import type { FastifyInstance } from "fastify";
import type { OnlinePlayersResponse, PlayersWsMessage } from "@msm/shared";
import { getSessionUser, isAuthenticated } from "../auth/auth.js";
import { getOnlinePlayers } from "../servers/online-players.js";
import { processManager } from "../servers/process-manager.js";
import { hasServerPermission, resolveServerAccess } from "../servers/server-access.js";

function namesToPayload(
  names: string[],
  partial?: Partial<OnlinePlayersResponse>,
): OnlinePlayersResponse {
  const players = [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => ({ name, uuid: null }));
  return {
    online: partial?.online ?? players.length > 0,
    playersOnline: players.length,
    playersMax: partial?.playersMax ?? 0,
    players,
    history: partial?.history ?? [],
    source: players.length > 0 ? "console" : "none",
    latencyMs: partial?.latencyMs ?? null,
    ...partial,
  };
}

export function registerPlayersWs(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/ws/servers/:id/players",
    { websocket: true },
    async (socket, request) => {
      const deny = (message: string) => {
        const msg: PlayersWsMessage = { type: "error", message };
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // ignore
        }
        socket.close();
      };

      if (!isAuthenticated(request)) {
        deny("Unauthorized");
        return;
      }

      const user = await getSessionUser(request);
      if (!user) {
        deny("Unauthorized");
        return;
      }

      const serverId = request.params.id;
      const access = await resolveServerAccess(user, serverId);
      if (!access) {
        deny("Server not found");
        return;
      }

      if (!hasServerPermission(access, "player.read")) {
        deny("Missing permission: player.read");
        return;
      }

      let snapshot: OnlinePlayersResponse;
      try {
        snapshot = await getOnlinePlayers(serverId);
      } catch {
        snapshot = namesToPayload(processManager.getOnlinePlayerNames(serverId), {
          online: processManager.isRunning(serverId),
        });
      }

      const snapMsg: PlayersWsMessage = { type: "snapshot", data: snapshot };
      socket.send(JSON.stringify(snapMsg));

      const onPlayers = (id: string, names: string[]) => {
        if (id !== serverId) return;
        const msg: PlayersWsMessage = {
          type: "players",
          players: names,
          online: processManager.isRunning(serverId) || names.length > 0,
        };
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // closed
        }
      };

      const onStatus = (id: string, status: string) => {
        if (id !== serverId) return;
        const running =
          status === "RUNNING" || status === "STARTING" || status === "STOPPING";
        const msg: PlayersWsMessage = {
          type: "status",
          online: running,
        };
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // closed
        }
      };

      processManager.on("players", onPlayers);
      processManager.on("status", onStatus);

      socket.on("close", () => {
        processManager.off("players", onPlayers);
        processManager.off("status", onStatus);
      });
    },
  );
}
