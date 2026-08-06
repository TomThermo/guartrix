/**
 * In-memory 1h stats ring per server on the daemon host.
 * Keeps history off the panel API heap (scale: memory grows with servers on this node only).
 */
import type { ServerStats } from "@msm/shared";

export interface StatsHistorySample {
  at: number;
  cpuPercent: number;
  memoryMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

const HISTORY_MS = 60 * 60 * 1000;
const MAX_SAMPLES = 3600;
const MIN_INTERVAL_MS = 900;

const rings = new Map<string, StatsHistorySample[]>();
const lastAt = new Map<string, number>();

function prune(samples: StatsHistorySample[]): StatsHistorySample[] {
  const cutoff = Date.now() - HISTORY_MS;
  const pruned = samples.filter((s) => s.at >= cutoff);
  if (pruned.length > MAX_SAMPLES) {
    return pruned.slice(pruned.length - MAX_SAMPLES);
  }
  return pruned;
}

export function pushDaemonStatsHistory(
  serverId: string,
  stats: ServerStats,
): void {
  const now = Date.now();
  const prev = lastAt.get(serverId) ?? 0;
  if (now - prev < MIN_INTERVAL_MS) return;
  lastAt.set(serverId, now);

  const sample: StatsHistorySample = {
    at: now,
    cpuPercent: stats.running ? stats.cpuPercent : 0,
    memoryMb: stats.running
      ? Math.round(stats.memoryUsedBytes / (1024 * 1024))
      : 0,
    networkRxBytes: stats.networkRxBytes ?? 0,
    networkTxBytes: stats.networkTxBytes ?? 0,
  };
  const next = prune([...(rings.get(serverId) ?? []), sample]);
  rings.set(serverId, next);
}

export function getDaemonStatsHistory(serverId: string): StatsHistorySample[] {
  const pruned = prune(rings.get(serverId) ?? []);
  if (pruned.length !== (rings.get(serverId)?.length ?? 0)) {
    rings.set(serverId, pruned);
  }
  return pruned;
}

/** Drop ring when a server is wiped / removed from the node. */
export function clearDaemonStatsHistory(serverId: string): void {
  rings.delete(serverId);
  lastAt.delete(serverId);
}
