import type {
  ActivityListResponse,
  ActivityQuery,
  BansResponse,
  BotCommandRequest,
  BotInfo,
  CloneServerRequest,
  TransferServerRequest,
  TransferJobStatus,
  ConnectInfo,
  CreateServerRequest,
  CreateSubUserRequest,
  CreateSubUserResponse,
  DiskUsageBreakdown,
  LogContentResponse,
  LogFileInfo,
  McServer,
  OnlinePlayersResponse,
  PlayersResponse,
  PortAllocation,
  ScheduleStep,
  ScheduledTask,
  ServerDatabase,
  ServerDatabasesResponse,
  ServerDetail,
  ServerStats,
  ServerSubUser,
  ServerType,
  ServerUpdateInfo,
  SpawnBotsRequest,
  UpdateSubUserRequest,
  UpdateServerRequest,
  VersionsResponse,
} from "@msm/shared";
import { request, activityQueryString } from "./client";

export const serversApi = {
  listServers: () => request<McServer[]>("/api/servers"),
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
  startServer: (id: string) =>
    request<McServer>(`/api/servers/${id}/start`, { method: "POST" }),
  stopServer: (id: string) =>
    request<McServer>(`/api/servers/${id}/stop`, { method: "POST" }),
  killServer: (id: string) =>
    request<McServer>(`/api/servers/${id}/kill`, { method: "POST" }),
  restartServer: (id: string) =>
    request<McServer>(`/api/servers/${id}/restart`, { method: "POST" }),
  cloneServer: (id: string, body: CloneServerRequest) =>
    request<McServer>(`/api/servers/${id}/clone`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  transferServer: (id: string, body: TransferServerRequest) =>
    request<{ server: McServer; transfer: TransferJobStatus }>(
      `/api/servers/${id}/transfer`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  getServerTransfer: (id: string) =>
    request<{ transfer: TransferJobStatus | null; server: McServer }>(
      `/api/servers/${id}/transfer`,
    ),
  importServer: async (form: FormData) => {
    const res = await fetch("/api/servers/import", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    return data as McServer;
  },
  getConnectInfo: (id: string) =>
    request<ConnectInfo>(`/api/servers/${id}/connect`),
  getDiskUsage: (id: string) =>
    request<DiskUsageBreakdown>(`/api/servers/${id}/disk`),
  versions: (type: ServerType) =>
    request<VersionsResponse>(`/api/versions?type=${type}`),
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
  getPlayers: (id: string) =>
    request<PlayersResponse>(`/api/servers/${id}/players`),
  getOnlinePlayers: (id: string) =>
    request<OnlinePlayersResponse>(`/api/servers/${id}/online`),
  getAllOnlinePlayers: () =>
    request<Record<string, OnlinePlayersResponse>>("/api/servers/online"),
  playerAction: (
    id: string,
    body: {
      action: string;
      name: string;
      reason?: string;
      message?: string;
      item?: string;
      count?: number;
      gamemode?: string;
    },
  ) =>
    request<{ ok: boolean; command: string; action: string; name: string }>(
      `/api/servers/${id}/players/action`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listPlayerModeration: (id: string, player?: string) => {
    const q = player ? `?player=${encodeURIComponent(player)}` : "";
    return request<{ events: import("@msm/shared").PlayerModerationEvent[] }>(
      `/api/servers/${id}/players/moderation${q}`,
    );
  },
  getServerUpdate: (id: string) =>
    request<ServerUpdateInfo>(`/api/servers/${id}/updates`),
  getAllServerUpdates: () =>
    request<Record<string, ServerUpdateInfo>>("/api/servers/updates"),
  getAllAddonUpdates: () =>
    request<Record<string, { available: number }>>("/api/servers/addon-updates"),
  applyServerUpdate: (id: string, mcVersion?: string) =>
    request<{ server: McServer; update: ServerUpdateInfo }>(
      `/api/servers/${id}/update`,
      {
        method: "POST",
        body: JSON.stringify({ mcVersion }),
      },
    ),
  reinstallServer: (
    id: string,
    body: { keepWorld: boolean; keepAddons: boolean },
  ) =>
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
  resetWorld: (
    id: string,
    body?: {
      dimensions?: Array<"overworld" | "nether" | "end">;
      regenerate?: boolean;
    },
  ) =>
    request<{ deleted: string[]; levelName: string }>(
      `/api/servers/${id}/world/reset`,
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),
  getWorldSeed: (id: string) =>
    request<{
      seed: string | null;
      source: "console" | "properties" | "none";
      propertiesSeed: string | null;
      consoleAvailable: boolean;
      mapUrl: string | null;
      externalMapUrl: string | null;
      mcVersion: string;
    }>(`/api/servers/${id}/world/seed`),
  queryWorldSeed: (id: string) =>
    request<{
      seed: string | null;
      source: "console" | "properties" | "none";
      propertiesSeed: string | null;
      consoleAvailable: boolean;
      mapUrl: string | null;
      externalMapUrl: string | null;
      mcVersion: string;
    }>(`/api/servers/${id}/world/seed/query`, { method: "POST", body: "{}" }),
  importWorld: async (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/servers/${id}/world/import`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    return data as { levelName: string; path: string };
  },
  getEngineSettings: (id: string) =>
    request<{
      supported: boolean;
      fields: Array<{
        id: string;
        file: string;
        label: string;
        hint?: string;
        type: "boolean" | "number" | "string";
        value: boolean | number | string | null;
        present: boolean;
      }>;
    }>(`/api/servers/${id}/engine`),
  updateEngineSettings: (
    id: string,
    updates: Record<string, boolean | number | string>,
  ) =>
    request<{
      supported: boolean;
      fields: Array<{
        id: string;
        file: string;
        label: string;
        hint?: string;
        type: "boolean" | "number" | "string";
        value: boolean | number | string | null;
        present: boolean;
      }>;
    }>(`/api/servers/${id}/engine`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    }),
  searchModpacks: (
    id: string,
    opts: { q?: string; source?: string; offset?: number; limit?: number },
  ) => {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.source) params.set("source", opts.source);
    if (opts.offset != null) params.set("offset", String(opts.offset));
    if (opts.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<{
      hits: Array<Record<string, unknown>>;
      totalHits: number;
      configured?: boolean;
    }>(`/api/servers/${id}/modpacks/search${qs ? `?${qs}` : ""}`);
  },
  installModpack: (
    id: string,
    body: {
      source?: string;
      projectId?: string;
      versionId?: string;
      modId?: number;
      fileId?: number;
    },
  ) =>
    request<{ title: string; versionNumber: string; filesInstalled: number }>(
      `/api/servers/${id}/modpacks/install`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  installGeyser: (id: string, withFloodgate = true) =>
    request<{ installed: string[]; udpPort: number; hint: string }>(
      `/api/servers/${id}/geyser`,
      {
        method: "POST",
        body: JSON.stringify({ withFloodgate }),
      },
    ),
  addWhitelist: (id: string, name: string) =>
    request<PlayersResponse>(`/api/servers/${id}/whitelist`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  removeWhitelist: (id: string, name: string) =>
    request<PlayersResponse>(
      `/api/servers/${id}/whitelist/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  addOp: (id: string, name: string, level = 4) =>
    request<PlayersResponse>(`/api/servers/${id}/ops`, {
      method: "POST",
      body: JSON.stringify({ name, level }),
    }),
  removeOp: (id: string, name: string) =>
    request<PlayersResponse>(
      `/api/servers/${id}/ops/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  getBans: (id: string) => request<BansResponse>(`/api/servers/${id}/bans`),
  addPlayerBan: (id: string, name: string, reason?: string, expires?: string) =>
    request<BansResponse>(`/api/servers/${id}/bans/players`, {
      method: "POST",
      body: JSON.stringify({ name, reason, expires }),
    }),
  updatePlayerBan: (
    id: string,
    name: string,
    body: { reason?: string; expires?: string },
  ) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/players/${encodeURIComponent(name)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  removePlayerBan: (id: string, name: string) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/players/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  addIpBan: (id: string, ip: string, reason?: string, expires?: string) =>
    request<BansResponse>(`/api/servers/${id}/bans/ips`, {
      method: "POST",
      body: JSON.stringify({ ip, reason, expires }),
    }),
  updateIpBan: (
    id: string,
    ip: string,
    body: { reason?: string; expires?: string },
  ) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/ips/${encodeURIComponent(ip)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  removeIpBan: (id: string, ip: string) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/ips/${encodeURIComponent(ip)}`,
      { method: "DELETE" },
    ),
  uploadServerIcon: async (id: string, file: Blob) => {
    const body = new FormData();
    body.append("file", file, "server-icon.png");
    const res = await fetch(`/api/servers/${id}/icon`, {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    return data as { ok: boolean; hasIcon: boolean; width: number; height: number };
  },
  deleteServerIcon: (id: string) =>
    request<{ ok: boolean; hasIcon: boolean }>(`/api/servers/${id}/icon`, {
      method: "DELETE",
    }),
  getConsoleFavorites: (id: string) =>
    request<{ commands: string[] }>(`/api/servers/${id}/console-favorites`),
  setConsoleFavorites: (id: string, commands: string[]) =>
    request<{ commands: string[] }>(`/api/servers/${id}/console-favorites`, {
      method: "PUT",
      body: JSON.stringify({ commands }),
    }),
  listDatabases: (id: string) =>
    request<ServerDatabasesResponse>(`/api/servers/${id}/databases`),
  createDatabase: (id: string, body?: { name?: string }) =>
    request<{ database: ServerDatabase }>(`/api/servers/${id}/databases`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  deleteDatabase: (id: string, dbId: string) =>
    request<void>(`/api/servers/${id}/databases/${encodeURIComponent(dbId)}`, {
      method: "DELETE",
    }),
  listAllocations: (id: string) =>
    request<{ allocations: PortAllocation[]; free: PortAllocation[] }>(
      `/api/servers/${id}/allocations`,
    ),
  assignAllocation: (
    id: string,
    body: {
      allocationId?: string;
      port?: number;
      protocol?: "tcp" | "udp";
      notes?: string;
      /** Also create/assign UDP on the same port (query / Geyser). */
      alsoUdp?: boolean;
    },
  ) =>
    request<{ allocation: PortAllocation }>(`/api/servers/${id}/allocations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAllocation: (
    id: string,
    allocId: string,
    body: { notes?: string | null; isPrimary?: boolean; alsoUdp?: boolean },
  ) =>
    request<{ allocation: PortAllocation }>(
      `/api/servers/${id}/allocations/${encodeURIComponent(allocId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteAllocation: (id: string, allocId: string) =>
    request<void>(
      `/api/servers/${id}/allocations/${encodeURIComponent(allocId)}`,
      { method: "DELETE" },
    ),
  listSubUsers: (id: string) =>
    request<{ subusers: ServerSubUser[] }>(`/api/servers/${id}/subusers`),
  createSubUser: (id: string, body: CreateSubUserRequest) =>
    request<CreateSubUserResponse>(`/api/servers/${id}/subusers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubUser: (id: string, subUserId: string, body: UpdateSubUserRequest) =>
    request<{ subuser: ServerSubUser }>(
      `/api/servers/${id}/subusers/${encodeURIComponent(subUserId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteSubUser: (id: string, subUserId: string) =>
    request<void>(
      `/api/servers/${id}/subusers/${encodeURIComponent(subUserId)}`,
      { method: "DELETE" },
    ),
  resendSubUserInvite: (id: string, subUserId: string) =>
    request<{ subuser: ServerSubUser; inviteUrl?: string }>(
      `/api/servers/${id}/subusers/${encodeURIComponent(subUserId)}/invite`,
      { method: "POST" },
    ),
  getProxySetup: (id: string) =>
    request<{
      supported: boolean;
      mode: "none" | "velocity" | "bungeecord";
      onlineMode: boolean;
      preventProxyConnections: boolean;
      velocitySecret: string;
      checklist: Array<{ id: string; label: string; ok: boolean }>;
    }>(`/api/servers/${id}/proxy`),
  applyProxySetup: (id: string, mode: "none" | "velocity" | "bungeecord") =>
    request<{
      supported: boolean;
      mode: "none" | "velocity" | "bungeecord";
      onlineMode: boolean;
      preventProxyConnections: boolean;
      velocitySecret: string;
      checklist: Array<{ id: string; label: string; ok: boolean }>;
    }>(`/api/servers/${id}/proxy`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  listTasks: (id: string) =>
    request<{ tasks: ScheduledTask[] }>(`/api/servers/${id}/tasks`),
  createTask: (
    id: string,
    body: {
      enabled?: boolean;
      kind?: "command" | "restart" | "backup" | "chain";
      mode: "daily" | "interval" | "weekly";
      dailyAt?: string;
      intervalHours?: number;
      weekdays?: number[];
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
      mode: "daily" | "interval";
      dailyAt: string;
      intervalHours: number;
      command: string;
      note: string | null;
      steps: ScheduleStep[];
    }>,
  ) =>
    request<{ task: ScheduledTask }>(
      `/api/servers/${id}/tasks/${encodeURIComponent(taskId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  runTaskNow: (id: string, taskId: string) =>
    request<{ task: ScheduledTask }>(
      `/api/servers/${id}/tasks/${encodeURIComponent(taskId)}/run`,
      { method: "POST", body: "{}" },
    ),
  deleteTask: (id: string, taskId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${id}/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
    ),
  listBots: (id: string) =>
    request<{ bots: BotInfo[] }>(`/api/servers/${id}/bots`),
  spawnBots: (id: string, body?: SpawnBotsRequest) =>
    request<{ bots: BotInfo[] }>(`/api/servers/${id}/bots`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  stopAllBots: (id: string) =>
    request<{ ok: boolean; bots: BotInfo[] }>(`/api/servers/${id}/bots`, {
      method: "DELETE",
    }),
  botCommand: (id: string, name: string, body: BotCommandRequest) =>
    request<{ bot?: BotInfo; bots?: BotInfo[] }>(
      `/api/servers/${id}/bots/${encodeURIComponent(name)}/command`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listServerActivity: (id: string, query: ActivityQuery = {}) =>
    request<ActivityListResponse>(
      `/api/servers/${id}/activity${activityQueryString(query)}`,
    ),
  listLogs: (id: string) =>
    request<{ files: LogFileInfo[] }>(`/api/servers/${id}/logs`),
  readLog: (id: string, path: string) =>
    request<LogContentResponse>(
      `/api/servers/${id}/logs/content?path=${encodeURIComponent(path)}`,
    ),
  getResourcePack: (id: string) =>
    request<{
      hasPack: boolean;
      sizeBytes: number;
      sha1: string | null;
      publicUrl: string;
      resourcePackUrl: string;
      requireResourcePack: boolean;
      prompt: string;
    }>(`/api/servers/${id}/resource-pack`),
  uploadResourcePack: async (id: string, form: FormData) => {
    const res = await fetch(`/api/servers/${id}/resource-pack`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    return data as {
      ok: boolean;
      sha1: string;
      publicUrl: string;
      sizeBytes: number;
    };
  },
  deleteResourcePack: (id: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/resource-pack`, {
      method: "DELETE",
    }),
};
