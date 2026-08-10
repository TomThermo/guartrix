import type { ScheduledTask } from "@guartrix/shared";
import { Badge, Button, ListGroup, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatWhen } from "../../utils";
import { describeSteps } from "./taskDraft";

export function TaskList({
  tasks,
  busy,
  canUpdate,
  canDelete,
  onRunNow,
  onToggleEnabled,
  onDelete,
}: {
  tasks: ScheduledTask[];
  busy: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onRunNow: (task: ScheduledTask) => void;
  onToggleEnabled: (task: ScheduledTask) => void;
  onDelete: (task: ScheduledTask) => void;
}) {
  const { t } = useI18n();
  return (
    <>
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
                {describeSteps(
                  task.steps?.length
                    ? task.steps
                    : [
                        {
                          kind: task.kind === "restart" ? "restart" : "command",
                          command: task.command,
                        },
                      ],
                )}
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
              {task.lastError && <div className="small text-danger mt-1">{task.lastError}</div>}
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
                    onClick={() => onToggleEnabled(task)}
                  >
                    {task.enabled ? t("common.disable") : t("common.enable")}
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="outline-danger" onClick={() => onDelete(task)}>
                    {t("common.delete")}
                  </Button>
                )}
              </Stack>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>
    </>
  );
}
