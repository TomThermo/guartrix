import { Form } from "react-bootstrap";
import { useI18n } from "../i18n/react";

/** Shared hour options for interval schedules (backups + task chains). */
export const SCHEDULE_INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12, 24, 48] as const;

export type ScheduleTimingMode = "off" | "daily" | "interval" | "weekly";

const WEEKDAY_DEFS = [
  [0, "weekdaySun"],
  [1, "weekdayMon"],
  [2, "weekdayTue"],
  [3, "weekdayWed"],
  [4, "weekdayThu"],
  [5, "weekdayFri"],
  [6, "weekdaySat"],
] as const;

export interface ScheduleFieldsProps {
  mode: ScheduleTimingMode;
  onModeChange: (mode: ScheduleTimingMode) => void;
  /** Which modes appear in the select (order preserved). */
  modes: readonly ScheduleTimingMode[];
  intervalHours: number;
  onIntervalHoursChange: (hours: number) => void;
  dailyAt: string;
  onDailyAtChange: (time: string) => void;
  weekdays?: number[];
  onWeekdaysChange?: (days: number[]) => void;
  /** Use backups.* or schedules.timing.* translation keys. */
  labels: "backups" | "schedules";
}

export function ScheduleFields({
  mode,
  onModeChange,
  modes,
  intervalHours,
  onIntervalHoursChange,
  dailyAt,
  onDailyAtChange,
  weekdays = [],
  onWeekdaysChange,
  labels,
}: ScheduleFieldsProps) {
  const { t } = useI18n();

  const modeLabel = (m: ScheduleTimingMode): string => {
    if (labels === "backups") {
      if (m === "off") return t("backups.modeOff");
      if (m === "interval") return t("backups.modeInterval");
      return t("backups.modeDaily");
    }
    if (m === "daily") return t("schedules.timing.modeDaily");
    if (m === "weekly") return t("schedules.timing.modeWeekly");
    return t("schedules.timing.modeInterval");
  };

  const whenLabel =
    labels === "backups" ? t("backups.mode") : t("schedules.timing.when");
  const timeLabel =
    labels === "backups" ? t("backups.timeLocal") : t("schedules.timing.time");
  const intervalLabel =
    labels === "backups"
      ? t("backups.intervalHours")
      : t("schedules.timing.intervalHours");

  return (
    <>
      <Form.Group className="mb-3">
        <Form.Label>{whenLabel}</Form.Label>
        <Form.Select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as ScheduleTimingMode)}
        >
          {modes.map((m) => (
            <option key={m} value={m}>
              {modeLabel(m)}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {(mode === "daily" || mode === "weekly") && (
        <Form.Group className="mb-3">
          <Form.Label>{timeLabel}</Form.Label>
          <Form.Control
            type="time"
            value={dailyAt}
            onChange={(e) => onDailyAtChange(e.target.value)}
            required
          />
        </Form.Group>
      )}

      {mode === "weekly" && onWeekdaysChange && (
        <Form.Group className="mb-3">
          <Form.Label>{t("schedules.timing.weekdays")}</Form.Label>
          <div className="d-flex flex-wrap gap-2">
            {WEEKDAY_DEFS.map(([day, key]) => (
              <Form.Check
                key={day}
                type="checkbox"
                id={`schedule-weekday-${day}`}
                label={t(`schedules.timing.${key}`)}
                checked={weekdays.includes(day)}
                onChange={(e) => {
                  onWeekdaysChange(
                    e.target.checked
                      ? [...weekdays, day].sort((a, b) => a - b)
                      : weekdays.filter((d) => d !== day),
                  );
                }}
              />
            ))}
          </div>
        </Form.Group>
      )}

      {mode === "interval" && (
        <Form.Group className="mb-3">
          <Form.Label>{intervalLabel}</Form.Label>
          <Form.Select
            value={intervalHours}
            onChange={(e) => onIntervalHoursChange(Number(e.target.value))}
          >
            {SCHEDULE_INTERVAL_HOURS.map((h) => (
              <option key={h} value={h}>
                {labels === "backups"
                  ? t("backups.everyHours", {
                      h,
                      plural: h === 1 ? "" : "s",
                    })
                  : t("schedules.timing.everyHours", {
                      h,
                      plural: h === 1 ? "" : "s",
                    })}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      )}
    </>
  );
}
