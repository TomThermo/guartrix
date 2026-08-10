import type { FormEvent } from "react";
import type { BackupSchedule, BackupScheduleMode } from "@guartrix/shared";
import { Button, Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatWhen } from "../../utils";
import { ScheduleFields } from "../ScheduleFields";

export function BackupScheduleSection({
  schedule,
  mode,
  onModeChange,
  intervalHours,
  onIntervalHoursChange,
  dailyAt,
  onDailyAtChange,
  cronExpression,
  onCronExpressionChange,
  savingSchedule,
  onSaveSchedule,
}: {
  schedule: BackupSchedule;
  mode: BackupScheduleMode;
  onModeChange: (mode: BackupScheduleMode) => void;
  intervalHours: number;
  onIntervalHoursChange: (hours: number) => void;
  dailyAt: string;
  onDailyAtChange: (value: string) => void;
  cronExpression: string;
  onCronExpressionChange: (value: string) => void;
  savingSchedule: boolean;
  onSaveSchedule: (e: FormEvent) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h3 className="h6 mb-3">
        <i className="fa-solid fa-clock me-2" />
        {t("backups.scheduleTitle")}
      </h3>
      <Form onSubmit={onSaveSchedule}>
        <ScheduleFields
          labels="backups"
          modes={["off", "interval", "daily", "cron"]}
          mode={mode}
          onModeChange={(m) => onModeChange(m as BackupScheduleMode)}
          intervalHours={intervalHours}
          onIntervalHoursChange={onIntervalHoursChange}
          dailyAt={dailyAt}
          onDailyAtChange={onDailyAtChange}
          cronExpression={cronExpression}
          onCronExpressionChange={onCronExpressionChange}
        />

        <div className="small text-secondary mb-3">
          {t("backups.lastRun", { when: formatWhen(schedule.lastRunAt) })}
          <br />
          {t("backups.nextRun", { when: formatWhen(schedule.nextRunAt) })}
        </div>

        <Button type="submit" variant="outline-primary" disabled={savingSchedule}>
          {savingSchedule ? t("common.saving") : t("common.save")}
        </Button>
      </Form>
    </>
  );
}
