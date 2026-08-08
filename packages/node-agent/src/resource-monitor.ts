/**
 * Background resource polling per running Minecraft container.
 * Streams Docker Engine stats and emits `stats` events; GET handlers read cache.
 */
import { EventEmitter } from "node:events";
import os from "node:os";
import type { ServerStats } from "@msm/shared";
import { formatBytes, resolveContainerName } from "./docker.js";
import {
  dockerPing,
  fetchContainerStatsOnce,
  streamContainerStats,
  containerStartedAtMs,
  type EngineStats,
} from "./docker-engine.js";
import { getDiskUsageCached, peekDiskUsage } from "./disk-usage.js";

function hostCpuCount(): number {
  return Math.max(os.cpus().length, 1);
}

function emptyStats(): ServerStats {
  return {
    running: false,
    cpuPercent: 0,
    memoryUsedBytes: 0,
    memoryLimitBytes: 0,
    memoryPercent: 0,
    networkRxBytes: 0,
    networkTxBytes: 0,
    blockReadBytes: 0,
    blockWriteBytes: 0,
    pids: 0,
    uptimeMs: 0,
    memoryUsedLabel: "0 B",
    memoryLimitLabel: "0 B",
    networkRxLabel: "0 B",
    networkTxLabel: "0 B",
    blockReadLabel: "0 B",
    blockWriteLabel: "0 B",
  };
}

function toServerStats(engine: EngineStats, startedAtMs: number | null): ServerStats {
  const cores = hostCpuCount();
  // UI expects ~0–100 of host; absolute CPU can be 600% on 6 cores.
  const cpuPercent = Math.min(100, engine.cpuAbsolute / cores);
  const memoryLimitBytes = engine.memoryLimitBytes || 0;
  const memoryPercent =
    memoryLimitBytes > 0 ? Math.min(100, (engine.memoryBytes / memoryLimitBytes) * 100) : 0;
  const uptimeMs = startedAtMs != null ? Math.max(0, Date.now() - startedAtMs) : 0;

  return {
    running: true,
    cpuPercent,
    memoryUsedBytes: engine.memoryBytes,
    memoryLimitBytes,
    memoryPercent,
    networkRxBytes: engine.networkRxBytes,
    networkTxBytes: engine.networkTxBytes,
    blockReadBytes: engine.blockReadBytes,
    blockWriteBytes: engine.blockWriteBytes,
    pids: engine.pids,
    uptimeMs,
    memoryUsedLabel: formatBytes(engine.memoryBytes),
    memoryLimitLabel: formatBytes(memoryLimitBytes),
    networkRxLabel: formatBytes(engine.networkRxBytes),
    networkTxLabel: formatBytes(engine.networkTxBytes),
    blockReadLabel: formatBytes(engine.blockReadBytes),
    blockWriteLabel: formatBytes(engine.blockWriteBytes),
  };
}

type ActivePoll = {
  abort: AbortController;
  startedAtMs: number | null;
  generation: number;
};

class ResourceMonitor extends EventEmitter {
  private polls = new Map<string, ActivePoll>();
  private latest = new Map<string, ServerStats>();
  private lastDiskKick = new Map<string, number>();
  private generation = 0;
  private engineOk: boolean | null = null;

  getCached(serverId: string): ServerStats | null {
    return this.latest.get(serverId) ?? null;
  }

  listCached(): Record<string, ServerStats> {
    const out: Record<string, ServerStats> = {};
    for (const [id, stats] of this.latest) out[id] = stats;
    return out;
  }

  /** Start (or restart) streaming stats for a running server. */
  enable(serverId: string): void {
    const existing = this.polls.get(serverId);
    if (existing) return;

    const abort = new AbortController();
    const generation = ++this.generation;
    const poll: ActivePoll = { abort, startedAtMs: null, generation };
    this.polls.set(serverId, poll);
    void this.run(serverId, poll);
  }

  disable(serverId: string): void {
    const poll = this.polls.get(serverId);
    if (poll) {
      poll.abort.abort();
      this.polls.delete(serverId);
    }
    this.lastDiskKick.delete(serverId);
    const cleared = emptyStats();
    const disk = peekDiskUsage(serverId);
    if (disk) cleared.disk = disk;
    this.latest.set(serverId, cleared);
    this.emit("stats", serverId, cleared);
  }

  isPolling(serverId: string): boolean {
    return this.polls.has(serverId);
  }

  private publish(serverId: string, stats: ServerStats): void {
    const disk = peekDiskUsage(serverId);
    if (disk) stats = { ...stats, disk };
    this.latest.set(serverId, stats);
    this.emit("stats", serverId, stats);
    void import("./stats-history.js").then(({ pushDaemonStatsHistory }) => {
      pushDaemonStatsHistory(serverId, stats);
    });

    const last = this.lastDiskKick.get(serverId) ?? 0;
    if (Date.now() - last < 30_000) return;
    this.lastDiskKick.set(serverId, Date.now());
    // Never block the stats stream on a dir walk
    void getDiskUsageCached(serverId)
      .then(async (d) => {
        const cur = this.latest.get(serverId);
        if (!cur?.running) return;
        const next = { ...cur, disk: d };
        this.latest.set(serverId, next);
        this.emit("stats", serverId, next);
        const { isOverDiskQuota } = await import("./disk-quota.js");
        if (await isOverDiskQuota(serverId)) {
          this.emit("disk-quota-exceeded", serverId);
        }
      })
      .catch(() => undefined);
  }

  private async ensureEngine(): Promise<boolean> {
    if (this.engineOk != null) return this.engineOk;
    this.engineOk = await dockerPing();
    return this.engineOk;
  }

  private async run(serverId: string, poll: ActivePoll): Promise<void> {
    const signal = poll.abort.signal;
    try {
      const name = await resolveContainerName(serverId);
      if (!name || signal.aborted) {
        this.disable(serverId);
        return;
      }

      poll.startedAtMs = await containerStartedAtMs(name, signal).catch(() => null);

      const ok = await this.ensureEngine();
      if (!ok) {
        // Fallback: periodic one-shot CLI-compatible API stats without stream
        await this.runPollingFallback(serverId, poll, name);
        return;
      }

      await streamContainerStats(
        name,
        (engine) => {
          if (signal.aborted) return;
          // Skip the first often-zero precpu sample
          if (
            engine.cpuAbsolute === 0 &&
            engine.memoryBytes === 0 &&
            !this.latest.get(serverId)?.running
          ) {
            // still publish memory if present on later frames
          }
          this.publish(serverId, toServerStats(engine, poll.startedAtMs));
        },
        signal,
      );
    } catch (_err) {
      if (signal.aborted) return;
      // Stream died — retry after short delay while still enabled
      await new Promise((r) => setTimeout(r, 2_000));
      if (signal.aborted) return;
      if (this.polls.get(serverId) === poll) {
        this.polls.delete(serverId);
        this.enable(serverId);
      }
      return;
    }

    // Stream ended without abort → reconnect if still wanted
    if (!signal.aborted && this.polls.get(serverId) === poll) {
      this.polls.delete(serverId);
      this.enable(serverId);
    }
  }

  private async runPollingFallback(
    serverId: string,
    poll: ActivePoll,
    name: string,
  ): Promise<void> {
    const signal = poll.abort.signal;
    while (!signal.aborted && this.polls.get(serverId) === poll) {
      try {
        const engine = await fetchContainerStatsOnce(name, signal);
        if (engine) {
          this.publish(serverId, toServerStats(engine, poll.startedAtMs));
        }
      } catch {
        // ignore tick errors
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
}

export const resourceMonitor = new ResourceMonitor();
