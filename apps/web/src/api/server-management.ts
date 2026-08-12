import type { McServer, ServerType, ServerUpdateInfo } from "@guartrix/shared";
import { request } from "./client";

export const serverManagementApi = {
  getServerUpdate: (id: string) => request<ServerUpdateInfo>(`/api/servers/${id}/updates`),
  getAllServerUpdates: () => request<Record<string, ServerUpdateInfo>>("/api/servers/updates"),
  getAllAddonUpdates: () =>
    request<Record<string, { available: number }>>("/api/servers/addon-updates"),
  applyServerUpdate: (
    id: string,
    body?: {
      mcVersion?: string;
      paperBuild?: number;
      fabricLoaderVersion?: string;
      forgeVersion?: string;
    },
  ) =>
    request<{ server: McServer; update: ServerUpdateInfo }>(`/api/servers/${id}/update`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  reinstallServer: (id: string, body: { keepWorld: boolean; keepAddons: boolean }) =>
    request<{ server: McServer }>(`/api/servers/${id}/reinstall`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  changeServerType: (
    id: string,
    body: { type: ServerType; mcVersion: string; wipeAddons: boolean },
  ) =>
    request<{ server: McServer }>(`/api/servers/${id}/change-type`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
