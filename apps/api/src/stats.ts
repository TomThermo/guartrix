import type { ServerStats } from "@msm/shared";
import { daemonStats } from "./daemon-client.js";
import { processManager } from "./process-manager.js";

export async function collectServerStats(
  serverId: string,
  opts?: { includeDisk?: boolean },
): Promise<ServerStats> {
  // Prefer live cache pushed from the daemon resource stream (Wings-style)
  const cached = processManager.getCachedStats(serverId);
  if (cached && !opts?.includeDisk) return cached;
  if (cached && opts?.includeDisk && cached.disk) return cached;

  return (await daemonStats(serverId, opts?.includeDisk ?? false)) as ServerStats;
}
