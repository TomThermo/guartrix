export type ScheduleStepKind = "command" | "restart" | "backup" | "wait";

export interface ScheduleStep {
  kind: ScheduleStepKind;
  /** Minecraft command without leading slash (command steps). */
  command?: string;
  /** Seconds to sleep (wait steps), 1–3600. */
  delaySeconds?: number;
  /**
   * For command/restart: skip when server is offline (default true).
   * Backup and wait ignore this.
   */
  onlyIfRunning?: boolean;
  /** Continue the chain if this step fails (default false). */
  continueOnFailure?: boolean;
}

export interface ScheduledTask {
  id: string;
  enabled: boolean;
  /**
   * Summary kind for list UI / legacy clients.
   * `"chain"` when there are multiple steps or a backup/wait-only schedule.
   */
  kind: "command" | "restart" | "backup" | "chain";
  /** Cron-like local time HH:mm for daily/weekly, or interval hours when mode is interval */
  mode: "daily" | "interval" | "weekly";
  dailyAt: string;
  intervalHours: number;
  /**
   * Days of week when mode === "weekly" (0 = Sunday … 6 = Saturday, JS `Date.getDay()`).
   * Ignored for daily/interval.
   */
  weekdays: number[];
  /**
   * Legacy single-command field (still filled from the first command step).
   * Prefer `steps` for new clients.
   */
  command: string;
  /** Ordered steps executed sequentially when the schedule fires. */
  steps: ScheduleStep[];
  note: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Last chain failure message, if any. */
  lastError: string | null;
}
