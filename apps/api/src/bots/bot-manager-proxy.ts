/**
 * Lazy-forks bot-worker-main so Mineflayer physics stays out of the API process.
 * Set BOT_WORKER=0 to fall back to in-process botManager (emergency only).
 */
import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import type { BotCommandRequest, BotInfo } from "@msm/shared";
import {
  botManager as inProcessBotManager,
  DEFAULT_COUNT,
} from "./bot-manager.js";
import { logger } from "../logger.js";
import { processManager } from "../servers/process-manager.js";

export { DEFAULT_COUNT };

const useInProcess = process.env.BOT_WORKER === "0";

type RpcResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }
  | { type: "ready" };

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const TIMEOUT = {
  list: 10_000,
  spawn: 120_000,
  stop: 60_000,
  stopAll: 120_000,
  command: 60_000,
  ping: 10_000,
  serverStatus: 5_000,
} as const;

let worker: ChildProcess | null = null;
let startGate: Promise<ChildProcess> | null = null;
const pending = new Map<string, Pending>();
let statusForwardHooked = false;

function resolveWorkerEntry(): { script: string; execArgv: string[] } {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const jsPath = path.join(dir, "bot-worker-main.js");
  const tsPath = path.join(dir, "bot-worker-main.ts");

  if (existsSync(jsPath)) {
    return { script: jsPath, execArgv: [] };
  }
  if (existsSync(tsPath)) {
    // tsx/dev: compile TypeScript entry in the child
    return { script: tsPath, execArgv: ["--import", "tsx"] };
  }
  throw new Error(
    `Bot worker entry not found (expected ${jsPath} or ${tsPath})`,
  );
}

function rejectAllPending(reason: string): void {
  for (const [id, p] of pending) {
    pending.delete(id);
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
}

function attachWorkerHandlers(child: ChildProcess): void {
  child.on("message", (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const msg = raw as RpcResponse;
    if ("type" in msg && msg.type === "ready") return;
    if (!("id" in msg) || typeof msg.id !== "string") return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if ("ok" in msg && msg.ok) {
      p.resolve(msg.result);
    } else if ("ok" in msg) {
      p.reject(new Error(msg.error || "Bot worker error"));
    }
  });

  child.on("exit", (code, signal) => {
    logger.error({ code, signal }, "Bot worker exited");
    if (worker === child) worker = null;
    rejectAllPending("Bot worker exited");
  });

  child.on("error", (err) => {
    logger.error({ err }, "Bot worker process error");
  });
}

function hookStatusForward(): void {
  if (statusForwardHooked) return;
  statusForwardHooked = true;
  processManager.on("status", (serverId: string, status: string) => {
    if (!worker?.connected) return;
    void rpc("serverStatus", { serverId, status }, TIMEOUT.serverStatus).catch(
      (err) => {
        logger.warn(
          { err, serverId, status },
          "Failed to forward serverStatus to bot worker",
        );
      },
    );
  });
}

async function startWorker(): Promise<ChildProcess> {
  const { script, execArgv } = resolveWorkerEntry();
  logger.info({ script }, "Starting Mineflayer bot worker");

  const child = fork(script, [], {
    execArgv,
    env: {
      ...process.env,
      GUARTRIX_IS_BOT_WORKER: "1",
    },
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  attachWorkerHandlers(child);
  worker = child;
  hookStatusForward();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Bot worker ready timeout"));
    }, TIMEOUT.ping);

    const onMessage = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const msg = raw as RpcResponse;
      if ("type" in msg && msg.type === "ready") {
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `Bot worker exited during start (code=${code} signal=${signal})`,
        ),
      );
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
  });

  return child;
}

async function ensureWorker(): Promise<ChildProcess> {
  if (worker?.connected) return worker;
  if (startGate) return startGate;

  startGate = (async () => {
    try {
      return await startWorker();
    } finally {
      startGate = null;
    }
  })();

  return startGate;
}

function rpc(
  op: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  return ensureWorker().then(
    (child) =>
      new Promise<unknown>((resolve, reject) => {
        if (!child.connected) {
          reject(new Error("Bot worker not connected"));
          return;
        }
        const id = nanoid();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Bot worker RPC timeout (${op})`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          child.send({ id, op, ...args });
        } catch (err) {
          pending.delete(id);
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }),
  );
}

async function killWorker(): Promise<void> {
  const child = worker;
  worker = null;
  if (!child) return;
  rejectAllPending("Bot worker shutting down");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

const proxyBotManager = {
  async listBots(serverId: string): Promise<BotInfo[]> {
    return (await rpc("list", { serverId }, TIMEOUT.list)) as BotInfo[];
  },

  async spawnBots(
    serverId: string,
    opts: {
      port: number;
      mcVersion: string;
      count?: number;
      prefix?: string;
      host?: string;
    },
  ): Promise<BotInfo[]> {
    return (await rpc(
      "spawn",
      { serverId, opts },
      TIMEOUT.spawn,
    )) as BotInfo[];
  },

  async stopBots(serverId: string): Promise<void> {
    await rpc("stop", { serverId }, TIMEOUT.stop);
  },

  async stopAll(): Promise<void> {
    try {
      if (worker?.connected || startGate) {
        await rpc("stopAll", {}, TIMEOUT.stopAll);
      }
    } finally {
      await killWorker();
    }
  },

  async stopBot(serverId: string, botId: string): Promise<void> {
    await rpc("stopBot", { serverId, botId }, TIMEOUT.stop);
  },

  async runCommand(
    serverId: string,
    botId: string,
    data: BotCommandRequest,
  ): Promise<BotInfo> {
    return (await rpc(
      "command",
      { serverId, botId, data },
      TIMEOUT.command,
    )) as BotInfo;
  },

  async runCommandOnAll(
    serverId: string,
    data: BotCommandRequest,
  ): Promise<BotInfo[]> {
    return (await rpc(
      "commandAll",
      { serverId, data },
      TIMEOUT.command,
    )) as BotInfo[];
  },
};

/**
 * Public surface used by routes/bots.ts and shutdown.
 * Over IPC, listBots is async — callers should await (works for in-process too).
 */
export const botManager = useInProcess ? inProcessBotManager : proxyBotManager;

if (useInProcess) {
  logger.warn("BOT_WORKER=0 — Mineflayer bots run in-process (emergency mode)");
}
