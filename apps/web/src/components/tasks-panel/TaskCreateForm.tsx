import type { FormEvent } from "react";
import type { ScheduleStepKind } from "@msm/shared";
import { Button, Form, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { ScheduleFields } from "../ScheduleFields";
import { newDraftStep, type DraftStep } from "./taskDraft";

export function TaskCreateForm({
  mode,
  onModeChange,
  dailyAt,
  onDailyAtChange,
  intervalHours,
  onIntervalHoursChange,
  cronExpression,
  onCronExpressionChange,
  weekdays,
  onWeekdaysChange,
  steps,
  setSteps,
  updateStep,
  removeStep,
  moveStep,
  note,
  onNoteChange,
  busy,
  onCreate,
}: {
  mode: "daily" | "interval" | "weekly" | "cron";
  onModeChange: (mode: "daily" | "interval" | "weekly" | "cron") => void;
  dailyAt: string;
  onDailyAtChange: (value: string) => void;
  intervalHours: number;
  onIntervalHoursChange: (hours: number) => void;
  cronExpression: string;
  onCronExpressionChange: (value: string) => void;
  weekdays: number[];
  onWeekdaysChange: (days: number[]) => void;
  steps: DraftStep[];
  setSteps: React.Dispatch<React.SetStateAction<DraftStep[]>>;
  updateStep: (key: string, patch: Partial<DraftStep>) => void;
  removeStep: (key: string) => void;
  moveStep: (key: string, dir: -1 | 1) => void;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  onCreate: (e: FormEvent) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h3 className="h6 mb-3">
        <i className="fa-solid fa-plus me-2" />
        {t("schedules.newTitle")}
      </h3>
      <Form onSubmit={onCreate}>
        <ScheduleFields
          labels="schedules"
          modes={["daily", "weekly", "interval", "cron"]}
          mode={mode}
          onModeChange={(m) => onModeChange(m as "daily" | "interval" | "weekly" | "cron")}
          intervalHours={intervalHours}
          onIntervalHoursChange={onIntervalHoursChange}
          dailyAt={dailyAt}
          onDailyAtChange={onDailyAtChange}
          weekdays={weekdays}
          onWeekdaysChange={onWeekdaysChange}
          cronExpression={cronExpression}
          onCronExpressionChange={onCronExpressionChange}
        />

        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Form.Label className="mb-0">{t("schedules.stepsLabel")}</Form.Label>
            <Button
              type="button"
              size="sm"
              variant="outline-secondary"
              disabled={busy || steps.length >= 20}
              onClick={() => setSteps((prev) => [...prev, newDraftStep("wait")])}
            >
              {t("schedules.addStep")}
            </Button>
          </div>
          <Stack gap={2}>
            {steps.map((step, index) => (
              <div key={step.key} className="border rounded p-2 bg-body-tertiary">
                <div className="d-flex gap-2 align-items-center mb-2 flex-wrap">
                  <span className="small text-secondary">#{index + 1}</span>
                  <Form.Select
                    size="sm"
                    style={{ maxWidth: "10rem" }}
                    value={step.kind}
                    onChange={(e) =>
                      updateStep(step.key, {
                        kind: e.target.value as ScheduleStepKind,
                      })
                    }
                  >
                    <option value="command">Command</option>
                    <option value="restart">Restart</option>
                    <option value="backup">Backup</option>
                    <option value="wait">Wait</option>
                  </Form.Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    disabled={index === 0}
                    onClick={() => moveStep(step.key, -1)}
                    title="Move up"
                  >
                    <i className="fa-solid fa-arrow-up" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    disabled={index === steps.length - 1}
                    onClick={() => moveStep(step.key, 1)}
                    title="Move down"
                  >
                    <i className="fa-solid fa-arrow-down" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-danger"
                    disabled={steps.length <= 1}
                    onClick={() => removeStep(step.key)}
                    title="Remove"
                  >
                    <i className="fa-solid fa-xmark" />
                  </Button>
                </div>
                {step.kind === "command" && (
                  <Form.Control
                    size="sm"
                    className="mb-2"
                    value={step.command}
                    onChange={(e) => updateStep(step.key, { command: e.target.value })}
                    placeholder="say Hello"
                    required
                    maxLength={200}
                  />
                )}
                {step.kind === "wait" && (
                  <Form.Control
                    size="sm"
                    type="number"
                    className="mb-2"
                    min={1}
                    max={3600}
                    value={step.delaySeconds}
                    onChange={(e) =>
                      updateStep(step.key, {
                        delaySeconds: Number(e.target.value) || 1,
                      })
                    }
                  />
                )}
                {(step.kind === "command" || step.kind === "restart") && (
                  <Form.Check
                    type="checkbox"
                    className="small"
                    label="Only if server is online"
                    checked={step.onlyIfRunning}
                    onChange={(e) =>
                      updateStep(step.key, {
                        onlyIfRunning: e.target.checked,
                      })
                    }
                  />
                )}
                <Form.Check
                  type="checkbox"
                  className="small"
                  label="Continue on failure"
                  checked={step.continueOnFailure}
                  onChange={(e) =>
                    updateStep(step.key, {
                      continueOnFailure: e.target.checked,
                    })
                  }
                />
              </div>
            ))}
          </Stack>
        </div>

        <Form.Group className="mb-3">
          <Form.Label>Note (optional)</Form.Label>
          <Form.Control
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            maxLength={120}
          />
        </Form.Group>

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? t("common.creating") : t("schedules.create")}
        </Button>
      </Form>
    </>
  );
}
