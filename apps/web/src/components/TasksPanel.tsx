import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ScheduleStep, ScheduleStepKind, ScheduledTask } from "@msm/shared";
import {
  Badge,
  Button,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatWhen } from "../utils";
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

type DraftStep = {
  key: string;
  kind: ScheduleStepKind;
  command: string;
  delaySeconds: number;
  onlyIfRunning: boolean;
  continueOnFailure: boolean;
};

function describeSteps(steps: ScheduleStep[]): string {
  return steps
    .map((s) => {
      if (s.kind === "command") return `/${s.command || "…"}`;
      if (s.kind === "restart") return "restart";
      if (s.kind === "backup") return "backup";
      return `wait ${s.delaySeconds || 0}s`;
    })
    .join(" → ");
}

function newDraftStep(kind: ScheduleStepKind = "command"): DraftStep {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    command: "say Scheduled task",
    delaySeconds: 30,
    onlyIfRunning: true,
    continueOnFailure: false,
  };
}

export function TasksPanel({
  serverId,
  onError,
  onNotice,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: Props) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runTarget, setRunTarget] = useState<ScheduledTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  const [mode, setMode] = useState<"daily" | "interval" | "weekly">("daily");
  const [dailyAt, setDailyAt] = useState("04:00");
  const [intervalHours, setIntervalHours] = useState(6);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [note, setNote] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([newDraftStep("command")]);

  const refresh = useCallback(async () => {
    const data = await api.listTasks(serverId);
    setTasks(data.tasks);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : t("schedules.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  function updateStep(key: string, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeStep(key: string) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  }

  function moveStep(key: string, dir: -1 | 1) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const payloadSteps: ScheduleStep[] = steps.map((s) => {
        const step: ScheduleStep = { kind: s.kind };
        if (s.kind === "command") step.command = s.command.trim();
        if (s.kind === "wait") step.delaySeconds = s.delaySeconds;
        if (s.kind === "command" || s.kind === "restart") {
          step.onlyIfRunning = s.onlyIfRunning;
        }
        if (s.continueOnFailure) step.continueOnFailure = true;
        return step;
      });
      await api.createTask(serverId, {
        mode,
        dailyAt: mode === "daily" || mode === "weekly" ? dailyAt : undefined,
        intervalHours: mode === "interval" ? intervalHours : undefined,
        weekdays: mode === "weekly" ? weekdays : undefined,
        note: note.trim() || null,
        enabled: true,
        steps: payloadSteps,
      });
      setNote("");
      setSteps([newDraftStep("command")]);
      onNotice("Schedule created.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create schedule");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(task: ScheduledTask) {
    if (!canUpdate) return;
    onError(null);
    onNotice(null);
    try {
      await api.updateTask(serverId, task.id, { enabled: !task.enabled });
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    }
  }

  function onRunNow(task: ScheduledTask) {
    if (!canUpdate) return;
    setRunTarget(task);
  }

  async function confirmRunNow() {
    if (!runTarget) return;
    onError(null);
    onNotice(null);
    setDialogBusy(true);
    setBusy(true);
    try {
      const result = await api.runTaskNow(serverId, runTarget.id);
      if (result.task.lastError) {
        onError(result.task.lastError);
      } else {
        onNotice("Schedule finished.");
      }
      setRunTarget(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setDialogBusy(false);
      setBusy(false);
    }
  }

  function onDelete(task: ScheduledTask) {
    if (!canDelete) return;
    setDeleteTarget(task);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    onError(null);
    onNotice(null);
    setDialogBusy(true);
    try {
      await api.deleteTask(serverId, deleteTarget.id);
      onNotice("Schedule deleted.");
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDialogBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-3">{t("schedules.title")}</h2>

      <Row className="g-4 mb-4">
        {canCreate && (
          <Col lg={5}>
            <h3 className="h6 mb-3">
              <i className="fa-solid fa-plus me-2" />
              New schedule
            </h3>
            <Form onSubmit={(e) => void onCreate(e)}>
              <Form.Group className="mb-3">
                <Form.Label>When</Form.Label>
                <Form.Select
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as "daily" | "interval" | "weekly")
                  }
                >
                  <option value="daily">Daily at…</option>
                  <option value="weekly">Weekly on…</option>
                  <option value="interval">Every X hours</option>
                </Form.Select>
              </Form.Group>

              {(mode === "daily" || mode === "weekly") && (
                <Form.Group className="mb-3">
                  <Form.Label>Time</Form.Label>
                  <Form.Control
                    type="time"
                    value={dailyAt}
                    onChange={(e) => setDailyAt(e.target.value)}
                    required
                  />
                </Form.Group>
              )}

              {mode === "weekly" && (
                <Form.Group className="mb-3">
                  <Form.Label>Weekdays</Form.Label>
                  <div className="d-flex flex-wrap gap-2">
                    {(
                      [
                        [0, "Sun"],
                        [1, "Mon"],
                        [2, "Tue"],
                        [3, "Wed"],
                        [4, "Thu"],
                        [5, "Fri"],
                        [6, "Sat"],
                      ] as const
                    ).map(([day, label]) => (
                      <Form.Check
                        key={day}
                        type="checkbox"
                        id={`weekday-${day}`}
                        label={label}
                        checked={weekdays.includes(day)}
                        onChange={(e) => {
                          setWeekdays((prev) =>
                            e.target.checked
                              ? [...prev, day].sort((a, b) => a - b)
                              : prev.filter((d) => d !== day),
                          );
                        }}
                      />
                    ))}
                  </div>
                </Form.Group>
              )}

              {mode === "interval" && (
                <Form.Group className="mb-3">
                  <Form.Label>Interval (hours)</Form.Label>
                  <Form.Select
                    value={intervalHours}
                    onChange={(e) => setIntervalHours(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 6, 8, 12, 24, 48].map((h) => (
                      <option key={h} value={h}>
                        Every {h} hour{h === 1 ? "" : "s"}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              )}

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">Steps</Form.Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    disabled={busy || steps.length >= 20}
                    onClick={() => setSteps((prev) => [...prev, newDraftStep("wait")])}
                  >
                    Add step
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
                          onChange={(e) =>
                            updateStep(step.key, { command: e.target.value })
                          }
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
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                />
              </Form.Group>

              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? t("common.creating") : t("schedules.create")}
              </Button>
            </Form>
          </Col>
        )}

        <Col lg={canCreate ? 7 : 12}>
          <h3 className="h6 mb-3">
            <i className="fa-solid fa-clock me-2" />
            Scheduled ({tasks.length})
          </h3>
          <ListGroup>
            {tasks.length === 0 && (
              <ListGroup.Item className="text-secondary">{t("schedules.empty")}</ListGroup.Item>
            )}
            {tasks.map((task) => (
              <ListGroup.Item
                key={task.id}
                className="d-flex justify-content-between align-items-start gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <div className="fw-semibold font-monospace small text-break">
                    {describeSteps(task.steps?.length ? task.steps : [{ kind: task.kind === "restart" ? "restart" : "command", command: task.command }])}
                  </div>
                  <div className="small text-secondary">
                    {task.mode === "weekly"
                      ? `Weekly ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                          .filter((_, i) => (task.weekdays || []).includes(i))
                          .join(", ")} at ${task.dailyAt}`
                      : task.mode === "daily"
                        ? `Daily at ${task.dailyAt}`
                        : `Every ${task.intervalHours}h`}
                    {task.note ? ` · ${task.note}` : ""}
                  </div>
                  <div className="small text-secondary">
                    Last: {formatWhen(task.lastRunAt)} · Next: {formatWhen(task.nextRunAt)}
                  </div>
                  {task.lastError && (
                    <div className="small text-danger mt-1">{task.lastError}</div>
                  )}
                  <Badge bg={task.enabled ? "success" : "secondary"} className="mt-1">
                    {task.enabled ? t("common.enabled") : t("common.disabled")}
                  </Badge>
                </div>
                {(canUpdate || canDelete) && (
                  <Stack direction="horizontal" gap={2} className="flex-wrap">
                    {canUpdate && (
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={busy}
                        onClick={() => onRunNow(task)}
                      >
                        Run now
                      </Button>
                    )}
                    {canUpdate && (
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => void toggleEnabled(task)}
                      >
                        {task.enabled ? t("common.disable") : t("common.enable")}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => onDelete(task)}
                      >
                        {t("common.delete")}
                      </Button>
                    )}
                  </Stack>
                )}
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Col>
      </Row>

      <ConfirmModal
        show={Boolean(runTarget)}
        title="Run schedule?"
        body="Run this schedule now?"
        confirmLabel="Run now"
        variant="primary"
        busy={dialogBusy}
        onCancel={() => {
          if (dialogBusy) return;
          setRunTarget(null);
        }}
        onConfirm={() => void confirmRunNow()}
      />
      <ConfirmModal
        show={Boolean(deleteTarget)}
        title="Delete schedule?"
        body="Delete this schedule?"
        confirmLabel={t("common.delete")}
        variant="danger"
        busy={dialogBusy}
        onCancel={() => {
          if (dialogBusy) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
