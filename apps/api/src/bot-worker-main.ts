/**
 * Forked child process that owns Mineflayer bots.
 * Parent (API) talks to this via child_process IPC — see bot-manager-proxy.ts.
 *
 * Parent sets GUARTRIX_IS_BOT_WORKER=1 in the fork env so bot-manager skips
 * the in-process processManager subscription (imports are ESM-hoisted).
 */
import { botManager } from "./bot-manager.js";
import { logger } from "./logger.js";

type WorkerRequest = {
  id: string;
  op: string;
  serverId?: string;
  botId?: string;
  opts?: {
    port: number;
    mcVersion: string;
    count?: number;
    prefix?: string;
    host?: string;
  };
  data?: unknown;
  status?: string;
};

type WorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

function reply(msg: WorkerResponse): void {
  if (typeof process.send !== "function") return;
  process.send(msg);
}

async function dispatch(msg: WorkerRequest): Promise<unknown> {
  switch (msg.op) {
    case "ping":
      return "pong";
    case "list": {
      if (!msg.serverId) throw new Error("serverId required");
      return botManager.listBots(msg.serverId);
    }
    case "spawn": {
      if (!msg.serverId) throw new Error("serverId required");
      if (!msg.opts) throw new Error("opts required");
      return botManager.spawnBots(msg.serverId, msg.opts);
    }
    case "stop": {
      if (!msg.serverId) throw new Error("serverId required");
      await botManager.stopBots(msg.serverId);
      return null;
    }
    case "stopAll": {
      await botManager.stopAll();
      return null;
    }
    case "stopBot": {
      if (!msg.serverId || !msg.botId) {
        throw new Error("serverId and botId required");
      }
      await botManager.stopBot(msg.serverId, msg.botId);
      return null;
    }
    case "command": {
      if (!msg.serverId || !msg.botId) {
        throw new Error("serverId and botId required");
      }
      return botManager.runCommand(
        msg.serverId,
        msg.botId,
        msg.data as Parameters<typeof botManager.runCommand>[2],
      );
    }
    case "commandAll": {
      if (!msg.serverId) throw new Error("serverId required");
      return botManager.runCommandOnAll(
        msg.serverId,
        msg.data as Parameters<typeof botManager.runCommandOnAll>[1],
      );
    }
    case "serverStatus": {
      if (!msg.serverId || msg.status == null) {
        throw new Error("serverId and status required");
      }
      botManager.handleServerStatus(msg.serverId, msg.status);
      return null;
    }
    default:
      throw new Error(`Unknown bot-worker op: ${msg.op}`);
  }
}

process.on("message", (raw: unknown) => {
  if (!raw || typeof raw !== "object") return;
  const msg = raw as WorkerRequest;
  if (typeof msg.id !== "string" || typeof msg.op !== "string") return;

  void (async () => {
    try {
      const result = await dispatch(msg);
      reply({ id: msg.id, ok: true, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn({ err, op: msg.op, id: msg.id }, "bot-worker RPC failed");
      reply({ id: msg.id, ok: false, error });
    }
  })();
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "bot-worker uncaughtException (keeping process alive)");
});

process.on("unhandledRejection", (reason) => {
  logger.error(
    { err: reason },
    "bot-worker unhandledRejection (keeping process alive)",
  );
});

if (typeof process.send === "function") {
  process.send({ type: "ready" });
}

logger.info("Mineflayer bot worker ready");
