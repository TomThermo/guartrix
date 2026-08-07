import type { AdminServerRow } from "@msm/shared";
import { request } from "./client";

export type AdminServersView = {
  defaultKeepCount: number;
  servers: AdminServerRow[];
};

export type AdminServerPatch = {
  name?: string;
  memoryMb?: number;
  diskMb?: number;
  cpuLimit?: number;
  ownerId?: string | null;
  suspended?: boolean;
  keepCount?: number;
};

export const adminServersApi = {
  list: () => request<AdminServersView>("/api/admin/servers"),

  update: (serverId: string, body: AdminServerPatch) =>
    request<{ server: AdminServerRow }>(
      `/api/admin/servers/${encodeURIComponent(serverId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
};
