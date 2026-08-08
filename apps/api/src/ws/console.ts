import type { FastifyInstance } from "fastify";
import type { ConsoleCommand, ConsoleMessage } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { getSessionUser, isAuthenticated } from "../auth/auth.js";
import { processManager } from "../servers/process-manager.js";
import { hasServerPermission, resolveServerAccess } from "../servers/server-access.js";

export function registerConsoleWs(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/ws/servers/:id/console",
    { websocket: true },
    async (socket, request) => {
      const deny = (message: string) => {
        const msg: ConsoleMessage = { type: "error", message };
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

      const canSend = hasServerPermission(access, "control.console");
      const canRead = canSend || hasServerPermission(access, "control.console.read");
      if (!canRead) {
        deny("Missing permission: control.console.read");
        return;
      }
      const canStop = hasServerPermission(access, "control.stop");
      const canRestart = hasServerPermission(access, "control.restart");
      const server = access.server;

      let lines: string[] = [];
      try {
        lines = await processManager.fetchHistory(serverId);
      } catch {
        lines = [];
      }
      const history: ConsoleMessage = { type: "history", lines };
      socket.send(JSON.stringify(history));

      const statusMsg: ConsoleMessage = { type: "status", status: server.status };
      socket.send(JSON.stringify(statusMsg));

      const cachedStats = processManager.getCachedStats(serverId);
      if (cachedStats) {
        const statsMsg: ConsoleMessage = { type: "stats", stats: cachedStats };
        socket.send(JSON.stringify(statsMsg));
      }

      void processManager.refreshRunning(serverId).catch(() => undefined);

      const onOutput = (id: string, line: string, stream: "stdout" | "stderr") => {
        if (id !== serverId) return;
        const msg: ConsoleMessage = { type: "output", line, stream };
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // closed
        }
      };

      const onStatus = (id: string, status: typeof server.status) => {
        if (id !== serverId) return;
        const msg: ConsoleMessage = { type: "status", status };
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // closed
        }
      };

      const onStats = (id: string, stats: import("@msm/shared").ServerStats) => {
        if (id !== serverId) return;
        const msg: ConsoleMessage = { type: "stats", stats };
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // closed
        }
      };

      processManager.on("output", onOutput);
      processManager.on("status", onStatus);
      processManager.on("stats", onStats);

      socket.on("message", (raw) => {
        try {
          if (!canSend) {
            const msg: ConsoleMessage = {
              type: "error",
              message: "Read-only: you cannot send console commands",
            };
            socket.send(JSON.stringify(msg));
            return;
          }
          const data = JSON.parse(String(raw)) as ConsoleCommand;
          if (data.type !== "command" || typeof data.command !== "string") return;
          const cmd = data.command.trim();
          const primary = cmd.split(/\s+/)[0]?.toLowerCase() ?? "";
          if ((primary === "stop" || primary === "end") && !canStop) {
            const msg: ConsoleMessage = {
              type: "error",
              message: "Missing permission: control.stop",
            };
            socket.send(JSON.stringify(msg));
            return;
          }
          if (primary === "restart" && !canRestart) {
            const msg: ConsoleMessage = {
              type: "error",
              message: "Missing permission: control.restart",
            };
            socket.send(JSON.stringify(msg));
            return;
          }
          processManager.sendCommand(serverId, data.command);
          logActivity({
            action: "console.command",
            request,
            user,
            server,
            metadata: { command: cmd },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const msg: ConsoleMessage = { type: "error", message };
          try {
            socket.send(JSON.stringify(msg));
          } catch {
            // ignore
          }
        }
      });

      socket.on("close", () => {
        processManager.off("output", onOutput);
        processManager.off("status", onStatus);
        processManager.off("stats", onStats);
      });
    },
  );
}
