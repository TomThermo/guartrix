import type { AdminServerBackupRow } from "@msm/shared";
import { request } from "./client";

export type AdminServerBackupsView = {
  defaultKeepCount: number;
  servers: AdminServerBackupRow[];
};

export const adminServerBackupsApi = {
  list: () =>
    request<AdminServerBackupsView>("/api/admin/server-backups"),

  updateKeepCount: (serverId: string, keepCount: number) =>
    request<{ server: AdminServerBackupRow }>(
      `/api/admin/server-backups/${encodeURIComponent(serverId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ keepCount }),
      },
    ),
};
