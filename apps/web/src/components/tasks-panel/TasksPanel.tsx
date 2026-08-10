import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ScheduledTask } from "@msm/shared";
import { Col, Row, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { ConfirmModal } from "../ConfirmModal";
import { TaskCreateForm } from "./TaskCreateForm";
import { TaskList } from "./TaskList";
import { newDraftStep, toPayloadSteps, type DraftStep } from "./taskDraft";

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
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

  const [mode, setMode] = useState<"daily" | "interval" | "weekly" | "cron">("daily");
  const [dailyAt, setDailyAt] = useState("04:00");
  const [intervalHours, setIntervalHours] = useState(6);
  const [cronExpression, setCronExpression] = useState("0 4 * * *");
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
  }, [refresh, onError, t]);

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
      await api.createTask(serverId, {
        mode,
        dailyAt: mode === "daily" || mode === "weekly" ? dailyAt : undefined,
        intervalHours: mode === "interval" ? intervalHours : undefined,
        weekdays: mode === "weekly" ? weekdays : undefined,
        cronExpression: mode === "cron" ? cronExpression : undefined,
        note: note.trim() || null,
        enabled: true,
        steps: toPayloadSteps(steps),
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
            <TaskCreateForm
              mode={mode}
              onModeChange={setMode}
              dailyAt={dailyAt}
              onDailyAtChange={setDailyAt}
              intervalHours={intervalHours}
              onIntervalHoursChange={setIntervalHours}
              cronExpression={cronExpression}
              onCronExpressionChange={setCronExpression}
              weekdays={weekdays}
              onWeekdaysChange={setWeekdays}
              steps={steps}
              setSteps={setSteps}
              updateStep={updateStep}
              removeStep={removeStep}
              moveStep={moveStep}
              note={note}
              onNoteChange={setNote}
              busy={busy}
              onCreate={(e) => void onCreate(e)}
            />
          </Col>
        )}

        <Col lg={canCreate ? 7 : 12}>
          <TaskList
            tasks={tasks}
            busy={busy}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onRunNow={onRunNow}
            onToggleEnabled={(task) => void toggleEnabled(task)}
            onDelete={onDelete}
          />
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
