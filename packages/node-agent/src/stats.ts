import os from "node:os";
import type { ServerStats } from "@msm/shared";
import {
  formatBytes,
  getContainerStats,
  normalizeContainerStats,
  parseDockerSize,
  resolveContainerName,
} from "./docker.js";
import {
  fetchContainerStatsOnce,
  dockerPing,
} from "./docker-engine.js";
import { getDiskUsageCached, peekDiskUsage } from "./disk-usage.js";
import { processManager } from "./process-manager.js";
import { resourceMonitor } from "./resource-monitor.js";

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

function engineToStats(
  engine: {
    memoryBytes: number;
    memoryLimitBytes: number;
    cpuAbsolute: number;
    networkRxBytes: number;
    networkTxBytes: number;
    blockReadBytes: number;
    blockWriteBytes: number;
    pids: number;
  },
): ServerStats {
  const cores = hostCpuCount();
  const cpuPercent = Math.min(100, engine.cpuAbsolute / cores);
  const memoryLimitBytes = engine.memoryLimitBytes || 0;
  const memoryPercent =
    memoryLimitBytes > 0
      ? Math.min(100, (engine.memoryBytes / memoryLimitBytes) * 100)
      : 0;
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
    memoryUsedLabel: formatBytes(engine.memoryBytes),
    memoryLimitLabel: formatBytes(memoryLimitBytes),
    networkRxLabel: formatBytes(engine.networkRxBytes),
    networkTxLabel: formatBytes(engine.networkTxBytes),
    blockReadLabel: formatBytes(engine.blockReadBytes),
    blockWriteLabel: formatBytes(engine.blockWriteBytes),
  };
}

async function oneShotStats(serverId: string): Promise<ServerStats> {
  const name = await resolveContainerName(serverId);
  if (!name) return emptyStats();

  if (await dockerPing()) {
    try {
      const engine = await fetchContainerStatsOnce(name);
      if (engine) return engineToStats(engine);
    } catch {
      // fall through to CLI
    }
  }

  const raw = await getContainerStats(serverId);
  if (!raw) return emptyStats();
  const normalized = normalizeContainerStats(raw, hostCpuCount());
  const [netRxRaw, netTxRaw] = raw.NetIO.split("/").map((s) => s.trim());
  const networkRxBytes = parseDockerSize(netRxRaw ?? "0B");
  const networkTxBytes = parseDockerSize(netTxRaw ?? "0B");
  return {
    running: true,
    cpuPercent: normalized.cpuPercent,
    memoryUsedBytes: normalized.memoryUsedBytes,
    memoryLimitBytes: normalized.memoryLimitBytes,
    memoryPercent: normalized.memoryPercent,
    networkRxBytes,
    networkTxBytes,
    blockReadBytes: normalized.blockReadBytes,
    blockWriteBytes: normalized.blockWriteBytes,
    pids: normalized.pids,
    memoryUsedLabel: formatBytes(normalized.memoryUsedBytes),
    memoryLimitLabel: formatBytes(normalized.memoryLimitBytes),
    networkRxLabel: formatBytes(networkRxBytes),
    networkTxLabel: formatBytes(networkTxBytes),
    blockReadLabel: formatBytes(normalized.blockReadBytes),
    blockWriteLabel: formatBytes(normalized.blockWriteBytes),
  };
}

export async function collectServerStats(
  serverId: string,
  opts?: { includeDisk?: boolean },
): Promise<ServerStats> {
  const includeDisk = opts?.includeDisk === true;

  let base = resourceMonitor.getCached(serverId);
  if (!base) {
    if (processManager.isRunning(serverId)) {
      // Ensure background stream is on, then one-shot for immediate response
      resourceMonitor.enable(serverId);
      base = await oneShotStats(serverId);
    } else {
      base = emptyStats();
    }
  }

  if (includeDisk) {
    try {
      base = {
        ...base,
        disk: await getDiskUsageCached(serverId),
      };
    } catch {
      const peek = peekDiskUsage(serverId);
      if (peek) base = { ...base, disk: peek };
    }
  }

  return base;
}
