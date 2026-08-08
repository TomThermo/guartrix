/**
 * Status transitions, auto-restart after crash, and resource-monitor event
 * wiring. Extracted from process-manager.ts so that file stays a thin facade.
 *
 * Functions operate on a `StatusHost` — the slice of ProcessManager state and
 * helpers they need — rather than a concrete class.
 */
import type { ServerStats, ServerStatus } from "@msm/shared";
import { invalidateDiskUsage } from "./disk-usage.js";
import { resourceMonitor } from "./resource-monitor.js";
import type { DaemonServerConfig, ManagedProcess } from "./process-types.js";

export interface StatusHost {
  readonly processes: Map<string, ManagedProcess>;
  readonly intentionalStops: Set<string>;
  readonly restartAttempts: Map<string, { count: number; at: number }>;
  readonly lastConfigs: Map<string, DaemonServerConfig>;
  readonly statuses: Map<string, ServerStatus>;
  emit(event: string, ...args: unknown[]): boolean;
  setStatus(serverId: string, status: ServerStatus, errorMessage?: string | null): void;
  start(server: DaemonServerConfig): Promise<void>;
  kill(serverId: string): Promise<void>;
}

/**
 * Record status, emit the `status` event, and toggle resource monitoring /
 * disk-usage cache in lockstep with RUNNING ↔ STOPPED/ERROR.
 */
export function applyProcessStatus(
  host: Pick<StatusHost, "statuses" | "emit">,
  serverId: string,
  status: ServerStatus,
  errorMessage?: string | null,
): void {
  host.statuses.set(serverId, status);
  host.emit("status", serverId, status, errorMessage ?? null);

  // Stream Docker Engine stats while the container is running.
  // Keep polling through STOPPING so the UI shows usage until exit.
  if (status === "RUNNING") {
    resourceMonitor.enable(serverId);
  } else if (status === "STOPPED" || status === "ERROR") {
    resourceMonitor.disable(serverId);
    invalidateDiskUsage(serverId);
  }
}

export async function maybeAutoRestart(
  host: StatusHost,
  serverId: string,
  reason: string,
): Promise<void> {
  try {
    // Never revive a panel-issued stop/kill.
    if (host.intentionalStops.has(serverId)) return;

    const server = host.lastConfigs.get(serverId);
    if (!server?.autoRestart) return;

    const now = Date.now();
    const prev = host.restartAttempts.get(serverId);
    const windowMs = 15 * 60_000;
    let count = 1;
    if (prev && now - prev.at < windowMs) {
      count = prev.count + 1;
    }
    host.restartAttempts.set(serverId, { count, at: now });

    if (count > 3) {
      host.setStatus(
        serverId,
        "ERROR",
        `${reason} — auto-restart stopped after ${count} crashes in 15m`,
      );
      return;
    }

    const delayMs = Math.min(60_000, 5_000 * count);
    await new Promise((r) => setTimeout(r, delayMs));

    // Bail if someone started it manually, disabled auto-restart, or stopped it.
    if (host.intentionalStops.has(serverId)) return;
    const again = host.lastConfigs.get(serverId);
    if (!again?.autoRestart || host.processes.has(serverId)) return;
    const status = host.statuses.get(serverId);
    if (
      status === "RUNNING" ||
      status === "STARTING" ||
      status === "STOPPING" ||
      status === "STOPPED"
    ) {
      return;
    }

    host.setStatus(serverId, "STARTING", `Auto-restarting after crash (attempt ${count})…`);
    await host.start(again);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    host.setStatus(serverId, "ERROR", `Auto-restart failed: ${message}`);
  }
}

/**
 * Forward live resource samples onto the same EventEmitter used for
 * console/status, and enforce disk-quota stops.
 */
export function wireResourceMonitorEvents(host: StatusHost): void {
  resourceMonitor.on("stats", (serverId: string, stats: ServerStats) => {
    host.emit("stats", serverId, stats);
  });

  const diskQuotaStopArmed = new Set<string>();
  resourceMonitor.on("disk-quota-exceeded", (serverId: string) => {
    if (diskQuotaStopArmed.has(serverId)) return;
    diskQuotaStopArmed.add(serverId);
    void (async () => {
      try {
        host.emit(
          "output",
          serverId,
          `[${new Date().toTimeString().slice(0, 8)}] [Guartrix Daemon] Disk quota exceeded — stopping server.`,
          "stderr",
        );
        await host.kill(serverId);
      } catch {
        // ignore
      } finally {
        // Allow another stop after a restart attempt later
        setTimeout(() => diskQuotaStopArmed.delete(serverId), 60_000);
      }
    })();
  });
}
