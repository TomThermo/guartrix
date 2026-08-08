import { describe, expect, it } from "vitest";
import { computeBackupNextRun } from "./backup-schedule.js";

describe("backup schedule next run", () => {
  it("returns null when mode is off", () => {
    expect(
      computeBackupNextRun({
        mode: "off",
        intervalHours: 6,
        dailyAt: "03:00",
        cronExpression: "0 3 * * *",
        keepCount: 7,
        lastRunAt: null,
        nextRunAt: null,
      }),
    ).toBeNull();
  });

  it("schedules interval first run about one minute out", () => {
    const from = new Date("2026-08-06T12:00:00.000Z");
    const next = computeBackupNextRun(
      {
        mode: "interval",
        intervalHours: 6,
        dailyAt: "03:00",
        cronExpression: "0 3 * * *",
        keepCount: 7,
        lastRunAt: null,
        nextRunAt: null,
      },
      from,
    );
    expect(next).toBe(new Date(from.getTime() + 60_000).toISOString());
  });
});
