/**
 * ProcessManager facade: owns the shared state maps and delegates start /
 * stop / attach / console / status work to the focused `process-*.ts` modules.
 */
import { EventEmitter } from "node:events";
import type { ServerStatus } from "@msm/shared";
import {
  stopProcess,
  killProcess,
  sendProcessCommand,
  stopAllProcesses,
} from "./process-lifecycle.js";
import { checkPortFree } from "./process-start.js";
import { startProcess } from "./process-start-run.js";
import {
  adoptRunning as adoptRunningFn,
  reattachOrphans as reattachOrphansFn,
} from "./process-attach.js";
import {
  daemonSay as daemonSayFn,
  getConsoleHistory,
  persistConsoleHistory,
  pushConsoleLine as pushConsoleLineFn,
} from "./process-console.js";
import {
  applyProcessStatus,
  maybeAutoRestart as maybeAutoRestartFn,
  wireResourceMonitorEvents,
} from "./process-status.js";
import type { DaemonServerConfig, ManagedProcess } from "./process-types.js";

export type { DaemonPortPublish, DaemonServerConfig } from "./process-types.js";
export { fixDataOwnership } from "./process-start.js";

class ProcessManager extends EventEmitter {
  // Note: `processes` / `intentionalStops` / `restartAttempts` / console maps
  // and the daemonSay/setStatus/persistHistory methods below are intentionally
  // not `private` — process-lifecycle.ts / process-console.ts / process-attach.ts
  // / process-start-run.ts / process-status.ts need to read and mutate them via
  // host interfaces. This class remains the only place that constructs/owns
  // that state; nothing outside this package touches them.
  processes = new Map<string, ManagedProcess>();
  /** Survives stop/exit so the console still shows output when the server is offline. */
  histories = new Map<string, string[]>();
  persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Last start config per server — used for auto-restart without a DB. */
  lastConfigs = new Map<string, DaemonServerConfig>();
  restartAttempts = new Map<string, { count: number; at: number }>();
  statuses = new Map<string, ServerStatus>();
  /** Panel-issued stop/kill — never treat the following exit as a crash. */
  intentionalStops = new Set<string>();

  isRunning(serverId: string): boolean {
    return this.processes.has(serverId);
  }

  getStatus(serverId: string): ServerStatus {
    return this.statuses.get(serverId) ?? "STOPPED";
  }

  getLastConfig(serverId: string): DaemonServerConfig | undefined {
    return this.lastConfigs.get(serverId);
  }

  getHistory(serverId: string): string[] {
    return getConsoleHistory(this, serverId);
  }

  persistHistory(serverId: string): void {
    persistConsoleHistory(this, serverId);
  }

  getContainerName(serverId: string): string | null {
    return this.processes.get(serverId)?.container ?? null;
  }

  getOnlinePlayerNames(serverId: string): string[] {
    const managed = this.processes.get(serverId);
    if (!managed) return [];
    return [...managed.onlinePlayers].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }

  pushConsoleLine(serverId: string, line: string, stream: "stdout" | "stderr" = "stdout"): void {
    pushConsoleLineFn(this, serverId, line, stream);
  }

  setStatus(serverId: string, status: ServerStatus, errorMessage?: string | null): void {
    applyProcessStatus(this, serverId, status, errorMessage);
  }

  async isPortFree(port: number, protocol: "tcp" | "udp" = "tcp"): Promise<boolean> {
    return checkPortFree(port, protocol);
  }

  daemonSay(serverId: string, message: string): void {
    daemonSayFn(this, serverId, message);
  }

  /**
   * If the Minecraft container is already running (e.g. after a panel/daemon
   * restart) but we have no stdin handle, reattach so commands work again.
   */
  async adoptRunning(serverId: string): Promise<boolean> {
    return adoptRunningFn(this, serverId);
  }

  /** On daemon boot: reclaim every live Guartrix Minecraft container. */
  async reattachOrphans(): Promise<number> {
    return reattachOrphansFn(this);
  }

  async start(server: DaemonServerConfig): Promise<void> {
    return startProcess(this, server);
  }

  async maybeAutoRestart(serverId: string, reason: string): Promise<void> {
    return maybeAutoRestartFn(this, serverId, reason);
  }

  /** Graceful stop: `stop` console command, falls back to `docker stop`. */
  async stop(serverId: string): Promise<void> {
    return stopProcess(this, serverId);
  }

  /** Immediate force-stop: docker kill + remove, no graceful `stop` command. */
  async kill(serverId: string): Promise<void> {
    return killProcess(this, serverId);
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    return sendProcessCommand(this, serverId, command);
  }

  async stopAll(): Promise<void> {
    return stopAllProcesses(this);
  }

  /**
   * Called when the daemon process itself is shutting down (deploy, crash,
   * watchdog-triggered restart, etc.) — deliberately does NOT stop managed
   * Minecraft servers. Attach clients use `--sig-proxy=false`, so killing them
   * (or exiting this process) only drops the console pipe; containers keep
   * running. The next daemon instance reattaches via `reattachOrphans()`.
   *
   * Only flushes buffered console history to disk so nothing is lost.
   */
  flushForShutdown(): void {
    for (const timer of this.persistTimers.values()) clearTimeout(timer);
    this.persistTimers.clear();
    for (const serverId of this.histories.keys()) {
      this.persistHistory(serverId);
    }
    // Drop attach clients without signalling the containers.
    for (const [serverId, managed] of this.processes) {
      this.processes.delete(serverId);
      try {
        managed.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }
}

export const processManager = new ProcessManager();

wireResourceMonitorEvents(processManager);
