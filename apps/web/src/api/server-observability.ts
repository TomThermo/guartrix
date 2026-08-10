import type {
  ActivityListResponse,
  ActivityQuery,
  LogContentResponse,
  LogFileInfo,
  ServerStats,
} from "@guartrix/shared";
import { activityQueryString, request } from "./client";

export const serverObservabilityApi = {
  getStats: (id: string) => request<ServerStats>(`/api/servers/${id}/stats`),
  getStatsHistory: (id: string) =>
    request<{
      samples: Array<{
        at: number;
        cpuPercent: number;
        memoryMb: number;
        networkRxBytes: number;
        networkTxBytes: number;
      }>;
    }>(`/api/servers/${id}/stats/history`),
  getAllStats: () => request<Record<string, ServerStats>>("/api/servers/stats"),
  listServerActivity: (id: string, query: ActivityQuery = {}) =>
    request<ActivityListResponse>(`/api/servers/${id}/activity${activityQueryString(query)}`),
  listLogs: (id: string) => request<{ files: LogFileInfo[] }>(`/api/servers/${id}/logs`),
  readLog: (id: string, path: string) =>
    request<LogContentResponse>(`/api/servers/${id}/logs/content?path=${encodeURIComponent(path)}`),
};
