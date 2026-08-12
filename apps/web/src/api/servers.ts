import type {
  CloneServerRequest,
  ConnectInfo,
  CreateServerRequest,
  DiskUsageBreakdown,
  McServer,
  ServerDetail,
  ServerType,
  TransferJobStatus,
  TransferServerRequest,
  UpdateServerRequest,
  VersionsResponse,
  VersionBuildsResponse,
} from "@guartrix/shared";
import { request, withCsrfHeaders } from "./client";
import { serverAllocationsApi } from "./server-allocations";
import { serverManagementApi } from "./server-management";
import { serverObservabilityApi } from "./server-observability";
import { serverPlayersApi } from "./server-players";
import { serverResourcesApi } from "./server-resources";
import { serverSubusersApi } from "./server-subusers";
import { serverTasksApi } from "./server-tasks";
import { serverWorldApi } from "./server-world";

function listServers(): Promise<McServer[]>;
function listServers(opts: {
  limit?: number;
  offset?: number;
  nodeId?: string;
  status?: string;
  q?: string;
}): Promise<{
  servers: McServer[];
  total: number;
  limit: number;
  offset: number;
}>;
function listServers(opts?: {
  limit?: number;
  offset?: number;
  nodeId?: string;
  status?: string;
  q?: string;
}) {
  if (!opts) return request<McServer[]>("/api/servers");
  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  if (opts.nodeId) params.set("nodeId", opts.nodeId);
  if (opts.status) params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  return request<{
    servers: McServer[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/servers?${params.toString()}`);
}

const serverCoreApi = {
  listServers,
  getCreateServerDefaults: () =>
    request<{ defaultBackupKeepCount: number }>("/api/servers/create-defaults"),
  getServer: (id: string) => request<ServerDetail>(`/api/servers/${id}`),
  createServer: (body: CreateServerRequest) =>
    request<McServer>("/api/servers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateServer: (id: string, body: UpdateServerRequest) =>
    request<ServerDetail>(`/api/servers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteServer: (id: string, password: string) =>
    request<void>(`/api/servers/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ password }),
    }),
  startServer: (id: string) => request<McServer>(`/api/servers/${id}/start`, { method: "POST" }),
  stopServer: (id: string) => request<McServer>(`/api/servers/${id}/stop`, { method: "POST" }),
  killServer: (id: string) => request<McServer>(`/api/servers/${id}/kill`, { method: "POST" }),
  restartServer: (id: string) =>
    request<McServer>(`/api/servers/${id}/restart`, { method: "POST" }),
  cloneServer: (id: string, body: CloneServerRequest) =>
    request<McServer>(`/api/servers/${id}/clone`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  transferServer: (id: string, body: TransferServerRequest) =>
    request<{ server: McServer; transfer: TransferJobStatus }>(`/api/servers/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getServerTransfer: (id: string) =>
    request<{ transfer: TransferJobStatus | null; server: McServer }>(
      `/api/servers/${id}/transfer`,
    ),
  importServer: async (form: FormData) => {
    const res = await fetch("/api/servers/import", {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : res.statusText);
    }
    return data as McServer;
  },
  getConnectInfo: (id: string) => request<ConnectInfo>(`/api/servers/${id}/connect`),
  getDiskUsage: (id: string) => request<DiskUsageBreakdown>(`/api/servers/${id}/disk`),
  versions: (type: ServerType) => request<VersionsResponse>(`/api/versions?type=${type}`),
  versionBuilds: (type: ServerType, mcVersion: string) =>
    request<VersionBuildsResponse>(
      `/api/versions/builds?type=${encodeURIComponent(type)}&mcVersion=${encodeURIComponent(mcVersion)}`,
    ),
};

export const serversApi = {
  ...serverCoreApi,
  ...serverManagementApi,
  ...serverPlayersApi,
  ...serverWorldApi,
  ...serverAllocationsApi,
  ...serverSubusersApi,
  ...serverTasksApi,
  ...serverObservabilityApi,
  ...serverResourcesApi,
};
