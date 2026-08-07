import { prisma } from "../db.js";
import { recordActivity } from "../activity-log.js";
import { daemonDisk } from "../nodes/daemon-client.js";

function diskWatchIntervalMs(): number {
  const raw = Number(process.env.DISK_WATCH_INTERVAL_MS ?? 5 * 60_000);
  if (!Number.isFinite(raw) || raw < 30_000) return 5 * 60_000;
  return Math.min(raw, 60 * 60_000);
}

function diskWatchPageSize(): number {
  const raw = Number(process.env.DISK_WATCH_PAGE_SIZE ?? 100);
  if (!Number.isFinite(raw) || raw < 10) return 100;
  return Math.min(500, Math.floor(raw));
}

function diskWatchConcurrency(): number {
  const raw = Number(process.env.DISK_WATCH_CONCURRENCY ?? 8);
  if (!Number.isFinite(raw) || raw < 1) return 8;
  return Math.min(32, Math.floor(raw));
}

const THRESHOLD = 0.9;
/** Don't re-alert the same server more than once per hour. */
const COOLDOWN_MS = 60 * 60_000;
const lastAlert = new Map<string, number>();

const DISK_WATCH_LOCK_KEY = "guartrix:disk-watch:lock";

async function acquireDiskWatchLock(): Promise<boolean> {
  try {
    const { getRedis } = await import("../redis.js");
    const redis = await getRedis();
    if (!redis) return true;
    const ttl = Math.max(30_000, Math.min(diskWatchIntervalMs(), 120_000));
    const instanceId = process.env.HOSTNAME || String(process.pid);
    const current = await redis.get(DISK_WATCH_LOCK_KEY);
    if (current === instanceId) {
      await redis.pexpire(DISK_WATCH_LOCK_KEY, ttl);
      return true;
    }
    const result = await redis.set(DISK_WATCH_LOCK_KEY, instanceId, "PX", ttl, "NX");
    return result === "OK";
  } catch {
    return true;
  }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await worker(items[i]!);
      }
    }),
  );
}

async function checkServerDisk(s: {
  id: string;
  name: string;
  diskMb: number;
  status: string;
}): Promise<void> {
  if (s.status === "CREATING" || s.status === "TRANSFERRING") return;
  try {
    const disk = (await daemonDisk(s.id)) as {
      totalBytes?: number;
      usedBytes?: number;
    };
    const usedBytes =
      typeof disk.totalBytes === "number"
        ? disk.totalBytes
        : typeof disk.usedBytes === "number"
          ? disk.usedBytes
          : null;
    if (usedBytes == null || s.diskMb <= 0) return;
    const quotaBytes = s.diskMb * 1024 * 1024;
    const ratio = usedBytes / quotaBytes;
    if (ratio < THRESHOLD) return;

    const prev = lastAlert.get(s.id) ?? 0;
    if (Date.now() - prev < COOLDOWN_MS) return;
    lastAlert.set(s.id, Date.now());

    await recordActivity({
      action: "server.disk_high",
      actor: "system",
      serverId: s.id,
      serverName: s.name,
      success: false,
      metadata: {
        usedBytes,
        quotaBytes,
        percent: Math.round(ratio * 100),
      },
    });
  } catch {
    // node offline / no disk stats
  }
}

/** One disk-watch pass (leader lock + paged scans). Used by BullMQ workers. */
export async function runDiskWatchTick(): Promise<void> {
  try {
    const isLeader = await acquireDiskWatchLock();
    if (!isLeader) return;

    const pageSize = diskWatchPageSize();
    const concurrency = diskWatchConcurrency();
    let cursor: string | undefined;

    for (;;) {
      const servers = await prisma.server.findMany({
        where: { diskMb: { gt: 0 } },
        select: { id: true, name: true, diskMb: true, status: true },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (servers.length === 0) break;

      await mapPool(servers, concurrency, checkServerDisk);
      cursor = servers[servers.length - 1]?.id;
      if (servers.length < pageSize) break;
    }
  } catch (err) {
    console.warn("[guartrix] Disk watch failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Schedule disk-watch ticks.
 * When `enqueue` is set (BullMQ HA), the timer only enqueues; workers run {@link runDiskWatchTick}.
 */
export function startDiskWatch(opts?: { enqueue?: () => Promise<unknown> }): void {
  const intervalMs = diskWatchIntervalMs();
  const run = async () => {
    if (opts?.enqueue) {
      try {
        await opts.enqueue();
      } catch (err) {
        console.warn(
          "[guartrix] Disk watch enqueue failed:",
          err instanceof Error ? err.message : err,
        );
      }
      return;
    }
    await runDiskWatchTick();
  };

  setTimeout(() => void run(), 30_000);
  setInterval(() => void run(), intervalMs);
}
