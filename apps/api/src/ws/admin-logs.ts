import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ConsoleMessage } from "@msm/shared";
import WebSocket from "ws";
import { getSessionUser, isAuthenticated } from "../auth/auth.js";
import { config } from "../config.js";
import { daemonWsAuthorization, getNodeToken } from "../nodes/daemon-client.js";
import { prisma } from "../db.js";
import { nodePublicUrl } from "../nodes/nodes.js";

/** Match scripts/lib.sh: logs live under DATA_DIR/logs (not /tmp). */
function logDir(): string {
  const override = process.env.LOG_DIR?.trim();
  if (override) return override;
  return path.join(config.dataDir, "logs");
}

const FILE_SOURCES = {
  daemon: "guartrix-daemon.log",
  api: "guartrix-api.log",
  web: "guartrix-web.log",
  monitor: "guartrix-monitor.log",
} as const;

type FileSource = keyof typeof FILE_SOURCES;
type LogSource = FileSource | "mysql";

const ALL_SOURCES = new Set<string>([...Object.keys(FILE_SOURCES), "mysql"]);

function logFile(source: FileSource): string {
  return path.join(logDir(), FILE_SOURCES[source]);
}

function send(socket: { send: (data: string) => void }, msg: ConsoleMessage): void {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // closed
  }
}

function readTail(file: string, maxLines: number): string[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((l) => l !== "")
      .slice(-maxLines);
  } catch {
    return [];
  }
}

function pipeChildToSocket(
  child: ChildProcessWithoutNullStreams,
  socket: { send: (data: string) => void; on: (ev: string, cb: () => void) => void },
): void {
  const push = (buf: Buffer) => {
    for (const line of buf.toString("utf8").split(/\r?\n/)) {
      if (line === "") continue;
      send(socket, { type: "output", line, stream: "stdout" });
    }
  };
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("error", (err) => {
    send(socket, { type: "error", message: err.message });
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
}

async function streamMysqlViaDaemon(
  socket: {
    send: (data: string) => void;
    on: (ev: string, cb: () => void) => void;
    close: () => void;
  },
  tail: number,
): Promise<void> {
  const node = await prisma.node.findFirst({ where: { isLocal: true } });
  if (!node) {
    send(socket, { type: "error", message: "No local daemon node configured" });
    return;
  }
  const token = getNodeToken(node.id);
  if (!token) {
    send(socket, { type: "error", message: "Daemon token missing for local node" });
    return;
  }

  const base = nodePublicUrl(node).replace(/^http/, "ws");
  const url = `${base}/mysql/logs/stream?tail=${tail}`;

  let remote: WebSocket;
  try {
    remote = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${daemonWsAuthorization(node.id, token)}`,
      },
    });
  } catch (err) {
    send(socket, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  remote.on("message", (data) => {
    try {
      socket.send(String(data));
    } catch {
      // closed
    }
  });
  remote.on("error", () => {
    send(socket, { type: "error", message: "MySQL log stream disconnected" });
  });
  remote.on("close", () => {
    try {
      socket.close();
    } catch {
      // ignore
    }
  });

  const cleanup = () => {
    try {
      remote.close();
    } catch {
      // ignore
    }
  };
  socket.on("close", cleanup);
  socket.on("error", cleanup);
}

export function registerAdminLogsWs(app: FastifyInstance): void {
  app.get<{ Params: { source: string }; Querystring: { tail?: string } }>(
    "/ws/admin/logs/:source",
    { websocket: true },
    async (socket, request) => {
      const deny = (message: string) => {
        send(socket, { type: "error", message });
        socket.close();
      };

      if (!isAuthenticated(request)) {
        deny("Unauthorized");
        return;
      }
      const user = await getSessionUser(request);
      if (!user || user.role !== "ADMIN") {
        deny("Admin only");
        return;
      }

      const source = request.params.source as LogSource;
      if (!ALL_SOURCES.has(source)) {
        deny(`Unknown log source: ${request.params.source}`);
        return;
      }

      const tail = Math.max(
        1,
        Math.min(2000, Number(request.query.tail ?? 300) || 300),
      );

      if (source === "mysql") {
        await streamMysqlViaDaemon(socket, tail);
        return;
      }

      const file = logFile(source);
      const lines = readTail(file, tail);
      send(socket, { type: "history", lines });

      if (!fs.existsSync(file)) {
        send(socket, {
          type: "output",
          line: `[guartrix] Log file not found yet: ${file}`,
          stream: "stderr",
        });
      }

      // Follow new lines (-F retries if the file appears later).
      const child = spawn("tail", ["-n", "0", "-F", file], {
        env: process.env,
      });
      pipeChildToSocket(child, socket);
    },
  );
}
