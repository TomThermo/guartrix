import { prisma } from "../db.js";
import { recordActivity } from "../activity-log.js";
import { daemonDisk } from "../nodes/daemon-client.js";

const INTERVAL_MS = 5 * 60_000;
const THRESHOLD = 0.9;
/** Don't re-alert the same server more than once per hour. */
const COOLDOWN_MS = 60 * 60_000;
const lastAlert = new Map<string, number>();

export function startDiskWatch(): void {
  const run = async () => {
    try {
      const servers = await prisma.server.findMany({
        where: { diskMb: { gt: 0 } },
        select: { id: true, name: true, diskMb: true, status: true },
      });
      for (const s of servers) {
        if (s.status === "CREATING" || s.status === "TRANSFERRING") continue;
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
          if (usedBytes == null || s.diskMb <= 0) continue;
          const quotaBytes = s.diskMb * 1024 * 1024;
          const ratio = usedBytes / quotaBytes;
          if (ratio < THRESHOLD) continue;

          const prev = lastAlert.get(s.id) ?? 0;
          if (Date.now() - prev < COOLDOWN_MS) continue;
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
    } catch (err) {
      console.warn(
        "[guartrix] Disk watch failed:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  setTimeout(() => void run(), 30_000);
  setInterval(() => void run(), INTERVAL_MS);
}
