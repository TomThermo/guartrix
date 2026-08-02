import type { ServerStats } from "@msm/shared";

export interface StatsHistorySample {
  at: number;
  cpuPercent: number;
  memoryMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

const HISTORY_MS = 60 * 60 * 1000;
const MAX_SAMPLES = 3600; // ~1 Hz for 1h
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

/** Record a live stats sample (rate-limited ~1 Hz). Survives tab switches; lost on API restart. */
export function pushStatsHistory(serverId: string, stats: ServerStats): void {
  const now = Date.now();
  const prev = lastAt.get(serverId) ?? 0;
  if (now - prev < 900) return;
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

export function getStatsHistory(serverId: string): StatsHistorySample[] {
  return prune(rings.get(serverId) ?? []);
}
