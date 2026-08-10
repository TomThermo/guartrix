import type { FastifyInstance } from "fastify";
import type {
  ConsoleCommand,
  ConsoleMessage,
  DaemonEventMessage,
  ServerStats,
  ServerStatus,
} from "@guartrix/shared";
import { processManager, resourceMonitor } from "@guartrix/node-agent";
import { daemonConfig } from "../config.js";
import { isDaemonAuthorized } from "../auth.js";
import { sendJson } from "../ws-utils.js";

/** Per-server console WebSocket and the multiplexed cross-server events WebSocket. */
export function registerWebSocketRoutes(app: FastifyInstance): void {
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

      const onOutput = (id: string, line: string, stream: "stdout" | "stderr") => {
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

  app.get("/events", { websocket: true }, (socket, request) => {
    if (!isDaemonAuthorized(request)) {
      sendJson(socket, { type: "error", message: "Unauthorized" } satisfies DaemonEventMessage);
      socket.close();
      return;
    }

    sendJson(socket, {
      type: "hello",
      daemonVersion: daemonConfig.version,
    } satisfies DaemonEventMessage);

    const onStatus = (serverId: string, status: ServerStatus, errorMessage: string | null) => {
      sendJson(socket, {
        type: "status",
        serverId,
        status,
        errorMessage,
      } satisfies DaemonEventMessage);
    };

    const onPlayers = (serverId: string, players: string[]) => {
      sendJson(socket, { type: "players", serverId, players } satisfies DaemonEventMessage);
    };

    const onOutput = (serverId: string, line: string, stream: "stdout" | "stderr") => {
      sendJson(socket, { type: "output", serverId, line, stream } satisfies DaemonEventMessage);
    };

    const onStats = (serverId: string, stats: ServerStats) => {
      sendJson(socket, { type: "stats", serverId, stats } satisfies DaemonEventMessage);
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
  });
}
