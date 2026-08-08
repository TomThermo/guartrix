import type { ScheduleStep, ScheduledTask } from "@msm/shared";
import { request } from "./client";

export const serverTasksApi = {
  listTasks: (id: string) => request<{ tasks: ScheduledTask[] }>(`/api/servers/${id}/tasks`),
  createTask: (
    id: string,
    body: {
      enabled?: boolean;
      kind?: "command" | "restart" | "backup" | "chain";
      mode: "daily" | "interval" | "weekly" | "cron";
      dailyAt?: string;
      intervalHours?: number;
      weekdays?: number[];
      cronExpression?: string;
      command?: string;
      note?: string | null;
      steps?: ScheduleStep[];
    },
  ) =>
    request<{ task: ScheduledTask }>(`/api/servers/${id}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTask: (
    id: string,
    taskId: string,
    body: Partial<{
      enabled: boolean;
      kind: "command" | "restart" | "backup" | "chain";
      mode: "daily" | "interval" | "weekly" | "cron";
      dailyAt: string;
      intervalHours: number;
      weekdays?: number[];
      cronExpression?: string;
      command: string;
      note: string | null;
      steps: ScheduleStep[];
    }>,
  ) =>
    request<{ task: ScheduledTask }>(`/api/servers/${id}/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  runTaskNow: (id: string, taskId: string) =>
    request<{ task: ScheduledTask }>(`/api/servers/${id}/tasks/${encodeURIComponent(taskId)}/run`, {
      method: "POST",
      body: "{}",
    }),
  deleteTask: (id: string, taskId: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    }),
};
