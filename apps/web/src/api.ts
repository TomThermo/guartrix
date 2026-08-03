import {
  BACKUP_TRANSFER_CHUNK_BYTES,
  BACKUP_UPLOAD_CONCURRENCY,
  BACKUP_UPLOAD_MAX_BYTES,
} from "@msm/shared";
import type {
  ActivityListResponse,
  ActivityQuery,
  AddonCategory,
  AddonProjectDetails,
  AddonSearchResponse,
  AddonSortIndex,
  AddonVersionInfo,
  AuthMeResponse,
  AuthUser,
  BackupListResponse,
  BackupSchedule,
  BackupUploadInitResponse,
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
  CreateUserRequest,
  DiskUsageBreakdown,
  FileContentResponse,
  FileListResponse,
  InstalledAddon,
  LogContentResponse,
  LogFileInfo,
  McServer,
  OnlinePlayersResponse,
  PlayersResponse,
  PortAllocation,
  ApplicationApiKeyRecord,
  AddonSyncResult,
  InstalledAddonUpdate,
  BillingSubscriptionRecord,
  PaymentRecord,
  PlanTemplateRecord,
  MollieStatusResponse,
  CreateCheckoutResponse,
  ScheduleStep,
  ScheduledTask,
  ServerBackup,
  ServerDatabase,
  ServerDatabasesResponse,
  ServerDetail,
  ServerStats,
  ServerSubUser,
  ServerType,
  ServerUpdateInfo,
  SpawnBotsRequest,
  SystemInfo,
  UpdateSubUserRequest,
  UpdateServerRequest,
  UpdateUserRequest,
  VersionsResponse,
} from "@msm/shared";

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Register a callback when any API call returns 401. Returns unsubscribe. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

/**
 * Backup transfers stay same-origin (Vite / prod-web stream-proxy to the API).
 * Cross-origin :3001 caused cookie/CORS issues and fake progress on rejected sockets.
 */
function transferUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function activityQueryString(query: ActivityQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw err;
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Expired/missing session → send UI back to login (skip failed login attempts)
    if (res.status === 401 && !url.includes("/api/auth/")) {
      notifyUnauthorized();
    }
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error
          ? JSON.stringify(data.error)
          : res.statusText;
    const code = typeof data.code === "string" ? data.code : undefined;
    throw new ApiError(message, res.status, code);
  }
  return data as T;
}

export { ApiError };

export const api = {
  me: () => request<AuthMeResponse>("/api/auth/me"),
  authConfig: () =>
    request<{
      registrationEnabled: boolean;
      passwordMinLength: number;
      passwordPolicy: string;
      emailVerificationRequired?: boolean;
    }>("/api/auth/config"),
  login: (username: string, password: string, rememberMe = false) =>
    request<{ ok: boolean; user?: AuthUser; requiresTwoFactor?: boolean }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password, rememberMe }),
      },
    ),
  loginTwoFactor: (code: string) =>
    request<{ ok: boolean; user: AuthUser }>("/api/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getTwoFactor: () =>
    request<{
      enabled: boolean;
      required: boolean;
      pendingSetup: boolean;
      recoveryCodesRemaining: number;
    }>("/api/auth/2fa"),
  setupTwoFactor: () =>
    request<{ secret: string; otpauthUrl: string; secretGrouped: string }>(
      "/api/auth/2fa/setup",
      { method: "POST", body: "{}" },
    ),
  enableTwoFactor: (code: string) =>
    request<{ ok: boolean; recoveryCodes: string[] }>("/api/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  disableTwoFactor: (password: string, code: string) =>
    request<{ ok: boolean }>("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    }),
  cancelTwoFactorSetup: () =>
    request<{ ok: boolean }>("/api/auth/2fa/cancel", {
      method: "POST",
      body: "{}",
    }),
  regenerateRecoveryCodes: (password: string, code: string) =>
    request<{ ok: boolean; recoveryCodes: string[] }>("/api/auth/2fa/recovery", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    }),
  listApiKeys: () =>
    request<import("@msm/shared").ApiKeyListResponse>("/api/account/api-keys"),
  createApiKey: (body: import("@msm/shared").ApiKeyCreateRequest) =>
    request<import("@msm/shared").ApiKeyCreateResponse>("/api/account/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeApiKey: (id: string) =>
    request<{ key: import("@msm/shared").ApiKeyRecord }>(
      `/api/account/api-keys/${id}`,
      { method: "DELETE" },
    ),
  exportAccountData: async () => {
    const res = await fetch("/api/account/export", { credentials: "include" });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/i.exec(cd);
    const fileName = match?.[1] || "guartrix-account-export.json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ password, confirm: "DELETE" }),
    }),
  register: (body: {
    username: string;
    email: string;
    password: string;
    acceptTerms: true;
  }) =>
    request<{
      ok: boolean;
      user?: AuthUser;
      emailVerificationRequired?: boolean;
      message?: string;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  listUsers: () => request<AuthUser[]>("/api/users"),
  getSystem: () => request<SystemInfo>("/api/system"),
  getAdminLicense: () =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
      label: string | null;
      checkedAt: string;
      keyMasked: string;
      hasKey: boolean;
      serverUrl: string;
      serverUrlSource: "file" | "env" | "default";
      serverUrlEnvDefault: string;
      maxServers?: number | null;
      maxNodes?: number | null;
      maxMemoryMb?: number | null;
      maxMemoryMbPerServer?: number | null;
      maxDiskMb?: number | null;
      freeTier?: boolean;
      features?: string[] | null;
      boundIp?: string | null;
      boundIps?: string[];
      usage?: {
        serverCount: number;
        memoryUsedMb: number;
        maxServerMemoryMb: number;
        nodeCount?: number;
      };
    }>("/api/admin/license"),
  getAdminLicenseStatus: () =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
    }>("/api/admin/license/status"),
  getAdminVersion: () =>
    request<import("@msm/shared").PanelVersionStatus & { productVersion: string }>(
      "/api/admin/version",
    ),
  /** Any logged-in user — sanitized license status for banners. */
  getLicenseStatus: () =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
    }>("/api/license/status"),
  setAdminLicense: (key: string) =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
      label: string | null;
      checkedAt: string;
      keyMasked: string;
      hasKey: boolean;
      serverUrl: string;
      serverUrlSource: "file" | "env" | "default";
      serverUrlEnvDefault: string;
      maxServers?: number | null;
      maxNodes?: number | null;
      maxMemoryMb?: number | null;
      maxMemoryMbPerServer?: number | null;
      maxDiskMb?: number | null;
      freeTier?: boolean;
      features?: string[] | null;
      boundIp?: string | null;
      boundIps?: string[];
      usage?: {
        serverCount: number;
        memoryUsedMb: number;
        maxServerMemoryMb: number;
        nodeCount?: number;
      };
    }>("/api/admin/license", {
      method: "PUT",
      body: JSON.stringify({ key }),
    }),
  /** Remove the license key — panel drops to the unlicensed free tier. */
  deleteAdminLicense: () =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
      label: string | null;
      checkedAt: string;
      keyMasked: string;
      hasKey: boolean;
      serverUrl: string;
      serverUrlSource: "file" | "env" | "default";
      serverUrlEnvDefault: string;
      maxServers?: number | null;
      maxNodes?: number | null;
      maxMemoryMb?: number | null;
      maxMemoryMbPerServer?: number | null;
      maxDiskMb?: number | null;
      freeTier?: boolean;
      features?: string[] | null;
      boundIp?: string | null;
      boundIps?: string[];
      usage?: {
        serverCount: number;
        memoryUsedMb: number;
        maxServerMemoryMb: number;
        nodeCount?: number;
      };
    }>("/api/admin/license", {
      method: "DELETE",
    }),
  setAdminLicenseServerUrl: (url: string | null) =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
      label: string | null;
      checkedAt: string;
      keyMasked: string;
      hasKey: boolean;
      serverUrl: string;
      serverUrlSource: "file" | "env" | "default";
      serverUrlEnvDefault: string;
      maxServers?: number | null;
      maxNodes?: number | null;
      maxMemoryMb?: number | null;
      maxMemoryMbPerServer?: number | null;
      maxDiskMb?: number | null;
      freeTier?: boolean;
      features?: string[] | null;
      boundIp?: string | null;
      boundIps?: string[];
      usage?: {
        serverCount: number;
        memoryUsedMb: number;
        maxServerMemoryMb: number;
        nodeCount?: number;
      };
    }>("/api/admin/license/server", {
      method: "PUT",
      body: JSON.stringify({ url }),
    }),
  revalidateAdminLicense: () =>
    request<{
      valid: boolean;
      status: string;
      message: string;
      expiresAt: string | null;
      label: string | null;
      checkedAt: string;
      keyMasked: string;
      hasKey: boolean;
      serverUrl: string;
      serverUrlSource: "file" | "env" | "default";
      serverUrlEnvDefault: string;
      maxServers?: number | null;
      maxNodes?: number | null;
      maxMemoryMb?: number | null;
      maxMemoryMbPerServer?: number | null;
      maxDiskMb?: number | null;
      freeTier?: boolean;
      features?: string[] | null;
      boundIp?: string | null;
      boundIps?: string[];
      usage?: {
        serverCount: number;
        memoryUsedMb: number;
        maxServerMemoryMb: number;
        nodeCount?: number;
      };
    }>("/api/admin/license/revalidate", { method: "POST", body: "{}" }),
  getAdminStatus: () =>
    request<import("@msm/shared").AdminStatusResponse>("/api/admin/status"),

  listNodes: () =>
    request<{ nodes: import("@msm/shared").DaemonNode[] }>("/api/nodes"),
  listAdminNodes: () =>
    request<{ nodes: import("@msm/shared").DaemonNode[] }>("/api/admin/nodes"),
  createNode: (body: import("@msm/shared").CreateNodeRequest) =>
    request<import("@msm/shared").CreateNodeResponse>("/api/admin/nodes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNode: (id: string, body: import("@msm/shared").UpdateNodeRequest) =>
    request<{ node: import("@msm/shared").DaemonNode }>(`/api/admin/nodes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNode: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/nodes/${id}`, { method: "DELETE" }),
  testNode: (id: string) =>
    request<import("@msm/shared").NodeTestResult & { node: import("@msm/shared").DaemonNode }>(
      `/api/admin/nodes/${id}/test`,
      { method: "POST", body: "{}" },
    ),
  regenerateNodeToken: (id: string) =>
    request<import("@msm/shared").CreateNodeResponse>(
      `/api/admin/nodes/${id}/regenerate-token`,
      { method: "POST", body: "{}" },
    ),
  getNodeInstall: (id: string) =>
    request<{
      token: string;
      publicUrl: string;
      envFile: string;
      installCommand: string;
      curlInstall?: string;
      repoUrl?: string;
      steps: string[];
      node: import("@msm/shared").DaemonNode;
    }>(`/api/admin/nodes/${id}/install`),
  remoteInstallNode: async (
    id: string,
    body: {
      sshHost?: string;
      sshPort?: number;
      sshUser: string;
      sshPassword?: string;
      sshPrivateKey?: string;
    },
    opts?: {
      onChunk?: (chunk: {
        type: "status" | "stdout" | "stderr" | "done";
        message?: string;
        data?: string;
        ok?: boolean;
        error?: string;
        exitCode?: number | null;
        stdout?: string;
        stderr?: string;
        test?: unknown;
        node?: import("@msm/shared").DaemonNode;
      }) => void;
      signal?: AbortSignal;
    },
  ) => {
    const res = await fetch(`/api/admin/nodes/${id}/remote-install`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    if (!res.ok || !res.body) {
      if (res.status === 401) notifyUnauthorized();
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        stdout?: string;
        stderr?: string;
      };
      const bits = [
        typeof data.error === "string" ? data.error : res.statusText,
        data.stdout,
        data.stderr,
      ].filter(Boolean);
      throw new Error(bits.join("\n\n") || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: {
      ok?: boolean;
      message?: string;
      error?: string;
      exitCode?: number | null;
      stdout?: string;
      stderr?: string;
      test?: unknown;
      node?: import("@msm/shared").DaemonNode;
    } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk: {
          type?: string;
          message?: string;
          data?: string;
          ok?: boolean;
          error?: string;
          exitCode?: number | null;
          stdout?: string;
          stderr?: string;
          test?: unknown;
          node?: import("@msm/shared").DaemonNode;
        };
        try {
          chunk = JSON.parse(trimmed) as typeof chunk;
        } catch {
          continue;
        }
        if (chunk.type === "done") {
          donePayload = chunk;
        }
        opts?.onChunk?.({
          type: (chunk.type as "status" | "stdout" | "stderr" | "done") || "status",
          message: chunk.message,
          data: chunk.data,
          ok: chunk.ok,
          error: chunk.error,
          exitCode: chunk.exitCode,
          stdout: chunk.stdout,
          stderr: chunk.stderr,
          test: chunk.test,
          node: chunk.node,
        });
      }
    }

    if (!donePayload?.ok) {
      throw new Error(
        donePayload?.error ||
          donePayload?.message ||
          "Remote install failed",
      );
    }
    return donePayload;
  },

  createUser: (body: CreateUserRequest) =>
    request<AuthUser>("/api/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateUser: (id: string, body: UpdateUserRequest) =>
    request<AuthUser>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteUser: (id: string) =>
    request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),

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
  searchAddons: (
    id: string,
    opts: {
      q?: string;
      category?: string;
      index?: AddonSortIndex;
      offset?: number;
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.category) params.set("category", opts.category);
    if (opts.index) params.set("index", opts.index);
    if (opts.offset != null) params.set("offset", String(opts.offset));
    if (opts.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<AddonSearchResponse>(
      `/api/servers/${id}/addons/search${qs ? `?${qs}` : ""}`,
      signal ? { signal } : undefined,
    );
  },
  listAddonCategories: (id: string) =>
    request<{
      type: ServerType;
      kind: "plugin" | "mod" | null;
      categories: AddonCategory[];
    }>(`/api/servers/${id}/addons/categories`),
  listAddons: (id: string) =>
    request<{
      type: ServerType;
      mcVersion: string;
      kind: "plugin" | "mod" | null;
      installed: InstalledAddon[];
    }>(`/api/servers/${id}/addons`),
  syncAddons: (id: string) =>
    request<AddonSyncResult>(`/api/servers/${id}/addons/sync`, {
      method: "POST",
      body: "{}",
    }),
  listAddonUpdates: (id: string) =>
    request<{ updates: InstalledAddonUpdate[]; available: number }>(
      `/api/servers/${id}/addons/updates`,
    ),
  listAddonVersions: (id: string, projectId: string) =>
    request<{
      serverMcVersion: string;
      mcVersion: string;
      gameVersions: string[];
      versions: AddonVersionInfo[];
    }>(`/api/servers/${id}/addons/${encodeURIComponent(projectId)}/versions`),
  getAddonProject: (id: string, projectId: string) =>
    request<{ project: AddonProjectDetails }>(
      `/api/servers/${id}/addons/project/${encodeURIComponent(projectId)}`,
    ),
  installAddon: (id: string, projectId: string, versionId?: string) =>
    request<{
      installed: InstalledAddon;
      dependenciesInstalled: InstalledAddon[];
      alreadyPresent: InstalledAddon[];
      restartRequired: boolean;
    }>(`/api/servers/${id}/addons/install`, {
      method: "POST",
      body: JSON.stringify({ projectId, versionId }),
    }),
  installAddonStack: (id: string, stackId: string) =>
    request<{
      stackId: string;
      installed: string[];
      errors: Array<{ name: string; error: string }>;
    }>(`/api/servers/${id}/addon-stacks`, {
      method: "POST",
      body: JSON.stringify({ stackId }),
    }),
  getConsoleFavorites: (id: string) =>
    request<{ commands: string[] }>(`/api/servers/${id}/console-favorites`),
  setConsoleFavorites: (id: string, commands: string[]) =>
    request<{ commands: string[] }>(`/api/servers/${id}/console-favorites`, {
      method: "PUT",
      body: JSON.stringify({ commands }),
    }),
  uninstallAddon: (id: string, projectId: string) =>
    request<{ ok: boolean; restartRequired: boolean }>(
      `/api/servers/${id}/addons/${encodeURIComponent(projectId)}`,
      { method: "DELETE" },
    ),
  listFiles: (id: string, path = ".") =>
    request<FileListResponse>(
      `/api/servers/${id}/files?path=${encodeURIComponent(path)}`,
    ),
  readFile: (id: string, path: string) =>
    request<FileContentResponse>(
      `/api/servers/${id}/files/content?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (id: string, path: string, content: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/files/content`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  mkdir: (id: string, path: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  renameFile: (id: string, from: string, to: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/files/rename`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  deleteFile: (id: string, path: string) =>
    request<void>(
      `/api/servers/${id}/files?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    ),
  uploadFile: async (id: string, dirPath: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(
      `/api/servers/${id}/files/upload?path=${encodeURIComponent(dirPath || ".")}`,
      { method: "POST", credentials: "include", body },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    return data as { ok: boolean; path: string; size: number };
  },
  downloadFile: async (id: string, path: string, fileName: string) => {
    const res = await fetch(
      `/api/servers/${id}/files/download?path=${encodeURIComponent(path)}`,
      { credentials: "include" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  compressFiles: (id: string, paths: string[], destination: string) =>
    request<{ ok: boolean; path: string; size: number }>(
      `/api/servers/${id}/files/compress`,
      {
        method: "POST",
        body: JSON.stringify({ paths, destination }),
      },
    ),
  downloadZip: async (id: string, paths: string[], fileName = "download.zip") => {
    const res = await fetch(`/api/servers/${id}/files/download-zip`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "download.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  decompressFile: (id: string, path: string, destination?: string) =>
    request<{ ok: boolean; path: string }>(
      `/api/servers/${id}/files/decompress`,
      {
        method: "POST",
        body: JSON.stringify({
          path,
          ...(destination ? { destination } : {}),
        }),
      },
    ),
  listBackups: (id: string) =>
    request<BackupListResponse>(`/api/servers/${id}/backups`),
  createBackup: (id: string, note?: string) =>
    request<{ backup: ServerBackup; schedule: BackupSchedule; busy: boolean }>(
      `/api/servers/${id}/backups`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  updateBackupSchedule: (
    id: string,
    schedule: Pick<BackupSchedule, "mode" | "intervalHours" | "dailyAt" | "keepCount">,
  ) =>
    request<{ schedule: BackupSchedule }>(`/api/servers/${id}/backups/schedule`, {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  deleteBackup: (id: string, backupId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${id}/backups/${encodeURIComponent(backupId)}`,
      { method: "DELETE" },
    ),
  restoreBackup: (id: string, backupId: string, startAfter?: boolean) =>
    request<{ ok: boolean; server: McServer }>(
      `/api/servers/${id}/backups/${encodeURIComponent(backupId)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ startAfter: Boolean(startAfter) }),
      },
    ),
  backupDownloadUrl: (id: string, backupId: string) =>
    transferUrl(
      `/api/servers/${id}/backups/${encodeURIComponent(backupId)}/download`,
    ),

  /**
   * Chunked backup upload: init → parallel 1 MiB PUTs (XHR progress) → complete.
   */
  uploadBackup: async (
    id: string,
    file: File,
    opts?: {
      note?: string;
      onProgress?: (p: {
        receivedBytes: number;
        totalBytes: number;
        phase?: "upload" | "finalize";
        speedBytesPerSec?: number;
      }) => void;
      signal?: AbortSignal;
    },
  ): Promise<ServerBackup> => {
    if (file.size <= 0) throw new Error("Empty file");
    if (file.size > BACKUP_UPLOAD_MAX_BYTES) {
      throw new Error("Backup too large (max 20 GB)");
    }
    const lower = file.name.toLowerCase();
    if (
      !lower.endsWith(".tar.gz") &&
      !lower.endsWith(".tgz") &&
      !lower.endsWith(".zip")
    ) {
      throw new Error("Backup must be a .tar.gz, .tgz or .zip file");
    }

    opts?.onProgress?.({
      receivedBytes: 0,
      totalBytes: file.size,
      phase: "upload",
      speedBytesPerSec: 0,
    });

    const init = await request<BackupUploadInitResponse>(
      `/api/servers/${id}/backups/upload/init`,
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          sizeBytes: file.size,
          note: opts?.note?.trim() || undefined,
        }),
        signal: opts?.signal,
      },
    );

    const chunkSize = init.chunkSize || BACKUP_TRANSFER_CHUNK_BYTES;
    const totalChunks = init.totalChunks;
    let completedBytes = 0;
    const inFlight = new Map<number, number>();
    let lastBytes = 0;
    let lastAt = Date.now();
    let speedBps = 0;

    const report = (phase: "upload" | "finalize" = "upload") => {
      let flying = 0;
      for (const n of inFlight.values()) flying += n;
      const receivedBytes = Math.min(file.size, completedBytes + flying);
      const now = Date.now();
      const dt = (now - lastAt) / 1000;
      if (dt >= 0.25) {
        speedBps = (receivedBytes - lastBytes) / dt;
        lastBytes = receivedBytes;
        lastAt = now;
      }
      opts?.onProgress?.({
        receivedBytes,
        totalBytes: file.size,
        phase,
        speedBytesPerSec: speedBps,
      });
    };

    const putChunk = (index: number, blob: Blob): Promise<void> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "PUT",
          `/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}/chunks/${index}`,
        );
        xhr.withCredentials = true;
        xhr.timeout = 0;
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        const onAbort = () => xhr.abort();
        opts?.signal?.addEventListener("abort", onAbort);

        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable) return;
          inFlight.set(index, ev.loaded);
          report("upload");
        };

        xhr.onerror = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          reject(new Error(`Chunk ${index} network error`));
        };
        xhr.ontimeout = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          reject(new Error(`Chunk ${index} timed out`));
        };
        xhr.onabort = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          reject(new DOMException("Upload aborted", "AbortError"));
        };
        xhr.onload = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          let data: { error?: unknown } = {};
          try {
            data = JSON.parse(xhr.responseText || "{}") as typeof data;
          } catch {
            // ignore
          }
          if (xhr.status === 401) {
            notifyUnauthorized();
            reject(new Error("Unauthorized"));
            return;
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            const message =
              typeof data.error === "string"
                ? data.error
                : data.error
                  ? JSON.stringify(data.error)
                  : xhr.statusText || `Chunk ${index} failed (${xhr.status})`;
            reject(new Error(message));
            return;
          }
          completedBytes += blob.size;
          report("upload");
          resolve();
        };

        inFlight.set(index, 0);
        xhr.send(blob);
      });

    const uploadOne = async (index: number): Promise<void> => {
      if (opts?.signal?.aborted) {
        throw new DOMException("Upload aborted", "AbortError");
      }
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      await putChunk(index, file.slice(start, end));
    };

    const concurrency = Math.max(
      1,
      Math.min(BACKUP_UPLOAD_CONCURRENCY, totalChunks),
    );
    let next = 0;
    let firstError: unknown = null;

    const workers = Array.from({ length: concurrency }, async () => {
      while (!firstError) {
        const index = next++;
        if (index >= totalChunks) return;
        try {
          await uploadOne(index);
        } catch (err) {
          firstError = err;
          throw err;
        }
      }
    });

    try {
      await Promise.all(workers);
    } catch (err) {
      void fetch(
        `/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}`,
        { method: "DELETE", credentials: "include" },
      ).catch(() => undefined);
      throw err;
    }

    if (opts?.signal?.aborted) {
      void fetch(
        `/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}`,
        { method: "DELETE", credentials: "include" },
      ).catch(() => undefined);
      throw new DOMException("Upload aborted", "AbortError");
    }

    report("finalize");
    const done = await request<{ backup: ServerBackup }>(
      `/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}/complete`,
      { method: "POST", body: JSON.stringify({}), signal: opts?.signal },
    );
    return done.backup;
  },

  /**
   * Download a backup (streamed). Prefer File System Access when available;
   * otherwise trigger a normal browser download.
   */
  downloadBackupChunked: async (
    id: string,
    backupId: string,
    fileName: string,
    opts?: {
      onProgress?: (p: { receivedBytes: number; totalBytes: number }) => void;
      signal?: AbortSignal;
    },
  ): Promise<void> => {
    const url = api.backupDownloadUrl(id, backupId);

    const picker = (
      window as unknown as {
        showSaveFilePicker?: (opts: {
          suggestedName: string;
          types?: Array<{
            description: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<{
          createWritable: () => Promise<{
            write: (data: AllowSharedBufferSource) => Promise<void>;
            close: () => Promise<void>;
            abort: () => Promise<void>;
          }>;
        }>;
      }
    ).showSaveFilePicker;

    if (typeof picker !== "function") {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      opts?.onProgress?.({ receivedBytes: 1, totalBytes: 1 });
      return;
    }

    const handle = await picker({
      suggestedName: fileName,
      types: [
        {
          description: "Backup archive",
          accept: { "application/gzip": [".gz", ".tgz"] },
        },
      ],
    });
    const writable = await handle.createWritable();

    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: opts?.signal,
      });
      if (!res.ok) {
        if (res.status === 401) notifyUnauthorized();
        throw new Error(`Download failed (${res.status})`);
      }
      const totalBytes = Number(res.headers.get("Content-Length") || "0");
      if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        await writable.write(buf);
        await writable.close();
        opts?.onProgress?.({ receivedBytes: buf.length, totalBytes: buf.length });
        return;
      }

      const reader = res.body.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writable.write(value);
          received += value.length;
          opts?.onProgress?.({
            receivedBytes: received,
            totalBytes: totalBytes || received,
          });
        }
      }
      await writable.close();
    } catch (err) {
      await writable.abort().catch(() => undefined);
      throw err;
    }
  },

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

  adminListNodeAllocations: (nodeId: string) =>
    request<{
      allocations: PortAllocation[];
      assigned: number;
      free: number;
    }>(`/api/admin/nodes/${encodeURIComponent(nodeId)}/allocations`),
  adminCreateNodeAllocations: (
    nodeId: string,
    body: {
      portStart: number;
      portEnd?: number;
      protocol?: "tcp" | "udp";
      ip?: string;
      notes?: string;
    },
  ) =>
    request<{
      created: number;
      skipped: number;
      allocations: PortAllocation[];
    }>(`/api/admin/nodes/${encodeURIComponent(nodeId)}/allocations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminDeleteNodeAllocation: (nodeId: string, allocId: string) =>
    request<void>(
      `/api/admin/nodes/${encodeURIComponent(nodeId)}/allocations/${encodeURIComponent(allocId)}`,
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
  getInvite: (token: string) =>
    request<{
      email: string;
      serverId: string;
      serverName: string;
      expiresAt: string | null;
      alreadyLinked: boolean;
    }>(`/api/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    request<{ ok: boolean; serverId: string }>(
      `/api/invites/${encodeURIComponent(token)}/accept`,
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
  listAdminActivity: (query: ActivityQuery = {}) =>
    request<ActivityListResponse>(`/api/admin/activity${activityQueryString(query)}`),

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

  mollieStatus: () => request<MollieStatusResponse>("/api/billing/mollie-status"),
  listBillingPlans: () =>
    request<{ plans: PlanTemplateRecord[] }>("/api/billing/plans"),
  listMyPayments: () =>
    request<{ payments: PaymentRecord[] }>("/api/billing/payments"),
  listMySubscriptions: () =>
    request<{ subscriptions: BillingSubscriptionRecord[] }>(
      "/api/billing/subscriptions",
    ),
  cancelSubscription: (id: string) =>
    request<{ subscription: BillingSubscriptionRecord }>(
      `/api/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body: "{}" },
    ),
  createCheckout: (body: { planSlug: string; redirectUrl?: string }) =>
    request<CreateCheckoutResponse>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  syncPayment: (id: string) =>
    request<{ payment: PaymentRecord }>(
      `/api/billing/payments/${encodeURIComponent(id)}/sync`,
      { method: "POST", body: "{}" },
    ),

  adminListPlans: () =>
    request<{ plans: PlanTemplateRecord[] }>("/api/admin/plans"),
  adminCreatePlan: (body: Partial<PlanTemplateRecord> & {
    slug: string;
    name: string;
    priceCents: number;
    maxServers: number;
    maxMemoryMb: number;
    maxDatabases: number;
  }) =>
    request<{ plan: PlanTemplateRecord }>("/api/admin/plans", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdatePlan: (id: string, body: Partial<PlanTemplateRecord>) =>
    request<{ plan: PlanTemplateRecord }>(
      `/api/admin/plans/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  adminDeletePlan: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/plans/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  adminListPayments: () =>
    request<{ payments: PaymentRecord[] }>("/api/admin/payments"),

  listApplicationKeys: () =>
    request<{ keys: ApplicationApiKeyRecord[]; maxKeys: number }>(
      "/api/admin/application-keys",
    ),
  createApplicationKey: (body: {
    name: string;
    scopes: string[];
    note?: string | null;
  }) =>
    request<{ key: ApplicationApiKeyRecord; token: string }>(
      "/api/admin/application-keys",
      { method: "POST", body: JSON.stringify(body) },
    ),
  revokeApplicationKey: (id: string) =>
    request<{ key: ApplicationApiKeyRecord }>(
      `/api/admin/application-keys/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  listAppPasswords: () =>
    request<{
      passwords: Array<{
        id: string;
        name: string;
        prefix: string;
        lastUsedAt: string | null;
        createdAt: string;
        revokedAt: string | null;
      }>;
      max: number;
    }>("/api/account/app-passwords"),
  createAppPassword: (body: { name: string }) =>
    request<{
      password: {
        id: string;
        name: string;
        prefix: string;
        lastUsedAt: string | null;
        createdAt: string;
        revokedAt: string | null;
      };
      token: string;
    }>("/api/account/app-passwords", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeAppPassword: (id: string) =>
    request<{ password: { id: string } }>(
      `/api/account/app-passwords/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};
