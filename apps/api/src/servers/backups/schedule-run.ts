import { logActivity } from "../../activity-log.js";
import {
  listDueBackupScheduleServerIds,
  readBackupSchedule,
  writeBackupSchedule,
} from "../backup-schedule.js";
import { isBackupBusy } from "../backup-busy.js";
import { createBackup } from "./create.js";

/** Run due scheduled backups (indexed BackupSchedule rows; batched). */
export async function runDueBackupSchedules(
  _serverIds?: string[],
): Promise<{ serverId: string; backupId: string }[]> {
  const done: { serverId: string; backupId: string }[] = [];
  const now = Date.now();
  const dueIds = await listDueBackupScheduleServerIds(new Date(now));

  for (const serverId of dueIds) {
    if (await isBackupBusy(serverId)) continue;
    const schedule = await readBackupSchedule(serverId);
    if (schedule.mode === "off" || !schedule.nextRunAt) continue;
    if (new Date(schedule.nextRunAt).getTime() > now) continue;

    try {
      const backup = await createBackup({
        serverId,
        trigger: "scheduled",
        note:
          schedule.mode === "daily"
            ? `Daily ${schedule.dailyAt}`
            : `Every ${schedule.intervalHours}h`,
      });
      done.push({ serverId, backupId: backup.id });
      logActivity({
        action: "backup.create",
        actor: "scheduler",
        serverId,
        metadata: {
          backupId: backup.id,
          size: backup.sizeLabel,
          trigger: "scheduled",
        },
      });
    } catch (err) {
      // Push next attempt 15 minutes out so we don't spin on failure.
      await writeBackupSchedule(serverId, {
        nextRunAt: new Date(now + 15 * 60_000).toISOString(),
      }).catch(() => undefined);
      console.error(`[backups] scheduled backup failed for ${serverId}:`, err);
      logActivity({
        action: "backup.failed",
        actor: "scheduler",
        serverId,
        success: false,
        metadata: {
          trigger: "scheduled",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return done;
}
