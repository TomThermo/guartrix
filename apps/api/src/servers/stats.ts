import type { ServerStats } from "@guartrix/shared";
import { daemonStats } from "../nodes/daemon-client.js";
import { processManager } from "./process-manager.js";

/** Placeholder when dashboard polls and the WS stats cache is cold. */
export function emptyServerStats(_serverId?: string): ServerStats {
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
    memoryUsedLabel: "0 B",
    memoryLimitLabel: "0 B",
    networkRxLabel: "0 B",
    networkTxLabel: "0 B",
    blockReadLabel: "0 B",
    blockWriteLabel: "0 B",
  };
}

export async function collectServerStats(
  serverId: string,
  opts?: { includeDisk?: boolean },
): Promise<ServerStats> {
  // Prefer live cache pushed from the daemon resource stream
  const cached = processManager.getCachedStats(serverId);
  if (cached && !opts?.includeDisk) return cached;
  if (cached && opts?.includeDisk && cached.disk) return cached;

  return (await daemonStats(serverId, opts?.includeDisk ?? false)) as ServerStats;
}
