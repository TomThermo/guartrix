import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { DiskUsageBreakdown } from "@msm/shared";
import { formatBytes } from "@msm/shared";
import { serverBackupsDir, serverDir } from "./config.js";

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        const st = await fs.stat(full);
        total += st.size;
      } catch {
        // ignore
      }
    }
  }
  return total;
}

/** Force a full walk (expensive). Prefer getDiskUsageCached. */
export async function collectDiskUsage(serverId: string): Promise<DiskUsageBreakdown> {
  const root = serverDir(serverId);
  const backups = serverBackupsDir(serverId);

  const [totalData, world, nether, end, mods, plugins, backupsBytes] = await Promise.all([
    dirSize(root),
    dirSize(path.join(root, "world")),
    dirSize(path.join(root, "world_nether")),
    dirSize(path.join(root, "world_the_end")),
    dirSize(path.join(root, "mods")),
    dirSize(path.join(root, "plugins")),
    dirSize(backups),
  ]);

  const worldBytes = world + nether + end;
  const modsPluginsBytes = mods + plugins;
  const otherBytes = Math.max(0, totalData - worldBytes - modsPluginsBytes);
  const totalBytes = totalData + backupsBytes;

  return {
    totalBytes,
    totalLabel: formatBytes(totalBytes),
    worldBytes,
    worldLabel: formatBytes(worldBytes),
    modsPluginsBytes,
    modsPluginsLabel: formatBytes(modsPluginsBytes),
    backupsBytes,
    backupsLabel: formatBytes(backupsBytes),
    otherBytes,
    otherLabel: formatBytes(otherBytes),
  };
}

type CacheEntry = {
  value: DiskUsageBreakdown;
  at: number;
  refreshing: Promise<DiskUsageBreakdown> | null;
};

const cache = new Map<string, CacheEntry>();
/** Serve stale while a refresh runs in the background. */
function diskTtlMs(): number {
  const raw = Number(process.env.DISK_USAGE_CACHE_MS ?? 30_000);
  if (!Number.isFinite(raw) || raw < 1_000) return 30_000;
  return Math.min(raw, 10 * 60_000);
}

export function peekDiskUsage(serverId: string): DiskUsageBreakdown | null {
  return cache.get(serverId)?.value ?? null;
}

export function invalidateDiskUsage(serverId: string): void {
  cache.delete(serverId);
}

/**
 * Cached disk usage. If the cache is fresh, return immediately.
 * If stale but a refresh is in flight, return the stale value (non-blocking).
 * If empty, wait for the first walk.
 */
export async function getDiskUsageCached(
  serverId: string,
  opts?: { maxAgeMs?: number; force?: boolean },
): Promise<DiskUsageBreakdown> {
  const maxAge = opts?.maxAgeMs ?? diskTtlMs();
  const entry = cache.get(serverId);
  const age = entry ? Date.now() - entry.at : Number.POSITIVE_INFINITY;
  const fresh = entry && age <= maxAge && !opts?.force;

  if (fresh && entry) return entry.value;

  if (entry?.refreshing) {
    if (entry.value && !opts?.force) return entry.value;
    return entry.refreshing;
  }

  const refreshing = collectDiskUsage(serverId)
    .then((value) => {
      cache.set(serverId, { value, at: Date.now(), refreshing: null });
      return value;
    })
    .catch((err) => {
      const cur = cache.get(serverId);
      if (cur) cur.refreshing = null;
      throw err;
    });

  cache.set(serverId, {
    value: entry?.value ?? {
      totalBytes: 0,
      totalLabel: "…",
      worldBytes: 0,
      worldLabel: "…",
      modsPluginsBytes: 0,
      modsPluginsLabel: "…",
      backupsBytes: 0,
      backupsLabel: "…",
      otherBytes: 0,
      otherLabel: "…",
    },
    at: entry?.at ?? 0,
    refreshing,
  });

  if (entry?.value && !opts?.force) return entry.value;
  return refreshing;
}
