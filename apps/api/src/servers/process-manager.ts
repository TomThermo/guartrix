import { EventEmitter } from "node:events";
import type { ServerStats, ServerStatus, ServerType } from "@guartrix/shared";
import type { DaemonServerConfig } from "@guartrix/node-agent";
import {
  daemonChown,
  daemonCommand,
  daemonHistory,
  daemonIsPortFree,
  daemonIsRunning,
  daemonOnlineNames,
  daemonPower,
} from "../nodes/daemon-client.js";
import { prisma } from "../db.js";
import { serverDir } from "../config.js";

export type { DaemonServerConfig };

/** Chown server data dir via daemon (accepts serverId or absolute dir ending with id). */
export async function fixDataOwnership(dirOrServerId: string): Promise<void> {
  const serverId = dirOrServerId.includes("/")
    ? dirOrServerId.replace(/\\/g, "/").split("/").filter(Boolean).pop()!
    : dirOrServerId;
  await daemonChown(serverId);
}

/**
 * Panel-side proxy for the node daemon.
 * Keeps a local cache so existing sync helpers (isRunning / online players) keep working.
 */
class ProcessManagerProxy extends EventEmitter {
  private running = new Set<string>();
  private onlinePlayers = new Map<string, string[]>();
  private statuses = new Map<string, ServerStatus>();
  private stats = new Map<string, ServerStats>();

  applyStatus(
    serverId: string,
    status: ServerStatus,
    errorMessage?: string | null,
    opts?: { fromBus?: boolean },
  ): void {
    this.statuses.set(serverId, status);
    if (status === "RUNNING" || status === "STARTING" || status === "STOPPING") {
      this.running.add(serverId);
    } else {
      this.running.delete(serverId);
    }
    this.emit("status", serverId, status, errorMessage ?? null);
    if (!opts?.fromBus) {
      void prisma.server
        .update({
          where: { id: serverId },
          data: {
            status,
            ...(errorMessage !== undefined ? { errorMessage } : {}),
          },
        })
        .catch(() => undefined);
      void import("../redis.js").then(({ publishPanelEvent }) =>
        publishPanelEvent({
          kind: "status",
          serverId,
          status,
          errorMessage: errorMessage ?? null,
        }),
      );
    }
  }

  applyPlayers(serverId: string, names: string[], opts?: { fromBus?: boolean }): void {
    this.onlinePlayers.set(serverId, names);
    this.emit("players", serverId, names);
    if (!opts?.fromBus) {
      void import("../redis.js").then(({ publishPanelEvent }) =>
        publishPanelEvent({ kind: "players", serverId, players: names }),
      );
    }
  }

  applyOutput(
    serverId: string,
    line: string,
    stream: "stdout" | "stderr" = "stdout",
    opts?: { fromBus?: boolean },
  ): void {
    this.emit("output", serverId, line, stream);
    if (!opts?.fromBus) {
      void import("../redis.js").then(({ publishPanelEvent }) =>
        publishPanelEvent({ kind: "output", serverId, line, stream }),
      );
    }
  }

  applyStats(serverId: string, stats: ServerStats, opts?: { fromBus?: boolean }): void {
    this.stats.set(serverId, stats);
    this.emit("stats", serverId, stats);
    if (!opts?.fromBus) {
      void import("../redis.js").then(({ publishPanelEvent }) =>
        publishPanelEvent({ kind: "stats", serverId, stats }),
      );
    }
  }

  getCachedStats(serverId: string): ServerStats | null {
    return this.stats.get(serverId) ?? null;
  }

  getAllCachedStats(): Record<string, ServerStats> {
    const out: Record<string, ServerStats> = {};
    for (const [id, s] of this.stats) out[id] = s;
    return out;
  }

  isRunning(serverId: string): boolean {
    return this.running.has(serverId);
  }

  getStatus(serverId: string): ServerStatus {
    return this.statuses.get(serverId) ?? "STOPPED";
  }

  getOnlinePlayerNames(serverId: string): string[] {
    return this.onlinePlayers.get(serverId) ?? [];
  }

  getHistory(_serverId: string): string[] {
    return [];
  }

  async fetchHistory(serverId: string): Promise<string[]> {
    return daemonHistory(serverId);
  }

  async refreshRunning(serverId: string): Promise<boolean> {
    try {
      const running = await daemonIsRunning(serverId);
      if (running) this.running.add(serverId);
      else this.running.delete(serverId);
      return running;
    } catch {
      return this.running.has(serverId);
    }
  }

  async refreshPlayers(serverId: string): Promise<string[]> {
    try {
      const names = await daemonOnlineNames(serverId);
      this.onlinePlayers.set(serverId, names);
      return names;
    } catch {
      return this.getOnlinePlayerNames(serverId);
    }
  }

  async isPortFree(
    port: number,
    excludeServerId?: string,
    nodeId?: string | null,
    protocol: "tcp" | "udp" = "tcp",
  ): Promise<boolean> {
    const taken = await prisma.server.findFirst({
      where: {
        port,
        ...(nodeId ? { nodeId } : {}),
        ...(excludeServerId ? { id: { not: excludeServerId } } : {}),
      },
    });
    if (taken) return false;
    const allocTaken = await prisma.allocation.findFirst({
      where: {
        port,
        protocol,
        ...(nodeId ? { nodeId } : {}),
        serverId: { not: null },
        ...(excludeServerId ? { serverId: { not: excludeServerId } } : {}),
      },
    });
    if (allocTaken) return false;
    return daemonIsPortFree(port, nodeId, protocol);
  }

  private async toConfig(server: {
    id: string;
    type: ServerType;
    mcVersion: string;
    port: number;
    memoryMb: number;
    diskMb?: number;
    cpuLimit?: number;
    autoRestart: boolean;
    javaPath?: string | null;
    startupCommand?: string | null;
    serverJar?: string | null;
    extraMounts?: unknown;
  }): Promise<DaemonServerConfig> {
    const { listServerAllocationPorts } = await import("./allocations.js");
    const { coerceExtraMounts } = await import("./extra-mounts.js");
    const ports = await listServerAllocationPorts(server.id);
    return {
      id: server.id,
      type: server.type,
      mcVersion: server.mcVersion,
      port: server.port,
      memoryMb: server.memoryMb,
      diskMb: server.diskMb ?? 10_240,
      cpuLimit: server.cpuLimit ?? 0,
      autoRestart: server.autoRestart,
      javaVersion: server.javaPath,
      startupCommand: server.startupCommand ?? null,
      serverJar: server.serverJar ?? null,
      ports,
      extraMounts: coerceExtraMounts(
        server.extraMounts as import("@prisma/client").Prisma.JsonValue,
      ),
    };
  }

  async start(serverId: string): Promise<void> {
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    });
    this.applyStatus(serverId, "STARTING", null);
    try {
      const { syncServerPortPermissionsBeforeStart } = await import("./allocations.js");
      const { notices } = await syncServerPortPermissionsBeforeStart(server);
      const result = await daemonPower(serverId, "start", {
        ...(await this.toConfig(server)),
        ...(notices.length ? { startupNotices: notices } : {}),
      });
      this.applyStatus(serverId, result.status ?? "RUNNING", null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.applyStatus(serverId, "ERROR", message);
      throw err;
    }
  }

  async stop(serverId: string): Promise<void> {
    this.applyStatus(serverId, "STOPPING");
    try {
      await daemonPower(serverId, "stop");
      this.applyStatus(serverId, "STOPPED", null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.applyStatus(serverId, "ERROR", message);
      throw err;
    }
  }

  async kill(serverId: string): Promise<void> {
    this.applyStatus(serverId, "STOPPING");
    try {
      await daemonPower(serverId, "kill");
      this.applyStatus(serverId, "STOPPED", null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.applyStatus(serverId, "ERROR", message);
      throw err;
    }
  }

  sendCommand(serverId: string, command: string): void {
    if (!this.running.has(serverId)) {
      throw new Error("Server is not running");
    }
    void daemonCommand(serverId, command).catch((err) => {
      this.emit(
        "output",
        serverId,
        `[error] ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    });
  }

  /**
   * Send a console command and collect subsequent output lines for a short window.
   * Used by HTTP `POST /api/servers/:id/command` so API clients can read the reply.
   */
  runCommandAndCollect(
    serverId: string,
    command: string,
    opts?: { timeoutMs?: number; idleMs?: number; maxLines?: number },
  ): Promise<{ lines: string[]; timedOut: boolean }> {
    const timeoutMs = Math.min(Math.max(opts?.timeoutMs ?? 2_500, 200), 15_000);
    const idleMs = Math.min(Math.max(opts?.idleMs ?? 450, 50), 5_000);
    const maxLines = Math.min(Math.max(opts?.maxLines ?? 200, 1), 500);

    return new Promise((resolve, reject) => {
      if (!this.running.has(serverId)) {
        reject(new Error("Server is not running"));
        return;
      }

      const lines: string[] = [];
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(hardTimer);
        this.off("output", onOutput);
        resolve({ lines, timedOut });
      };

      const bumpIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        // After first line, stop when console goes quiet (command finished printing).
        if (lines.length > 0) {
          idleTimer = setTimeout(() => finish(false), idleMs);
        }
      };

      const onOutput = (id: string, line: string, _stream?: "stdout" | "stderr") => {
        if (id !== serverId) return;
        lines.push(line);
        if (lines.length >= maxLines) {
          finish(false);
          return;
        }
        bumpIdle();
      };

      const hardTimer = setTimeout(() => finish(true), timeoutMs);
      this.on("output", onOutput);

      try {
        this.sendCommand(serverId, command);
        // If nothing arrives, still wait the full timeout (some cmds are silent).
      } catch (err) {
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(hardTimer);
        this.off("output", onOutput);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Wait for a console line matching `match` after optionally sending a command.
   * Listener is attached before the command is sent to avoid races.
   */
  waitForOutput(
    serverId: string,
    match: (line: string) => boolean,
    opts?: { timeoutMs?: number; command?: string },
  ): Promise<string> {
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    return new Promise((resolve, reject) => {
      if (opts?.command && !this.running.has(serverId)) {
        reject(new Error("Server is not running"));
        return;
      }
      const onOutput = (id: string, line: string) => {
        if (id !== serverId) return;
        if (!match(line)) return;
        cleanup();
        resolve(line);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for console output"));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off("output", onOutput);
      };
      this.on("output", onOutput);
      if (opts?.command) {
        try {
          this.sendCommand(serverId, opts.command);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  async stopAll(): Promise<void> {
    const ids = [...this.running];
    await Promise.all(ids.map((id) => this.stop(id).catch(() => undefined)));
  }

  serverDataDir(serverId: string): string {
    return serverDir(serverId);
  }
}

export const processManager = new ProcessManagerProxy();
