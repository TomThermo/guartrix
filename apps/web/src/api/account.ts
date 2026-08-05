import type {
  ActivityListResponse,
  ActivityQuery,
  AuthUser,
  CreateUserRequest,
  ApplicationApiKeyRecord,
  SystemInfo,
  UpdateUserRequest,
} from "@msm/shared";
import { request, notifyUnauthorized, activityQueryString } from "./client";

export const accountApi = {
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
  getPushStatus: () =>
    request<{
      configured: boolean;
      publicKey: string | null;
      subscriptionCount: number;
    }>("/api/account/push/status"),
  subscribePush: (body: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  }) =>
    request<{ ok: boolean }>("/api/account/push/subscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  unsubscribePush: (endpoint: string) =>
    request<{ ok: boolean }>("/api/account/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
  clearPushSubscriptions: () =>
    request<{ ok: boolean; deleted: number }>(
      "/api/account/push/subscriptions",
      { method: "DELETE" },
    ),
  listUsers: () => request<AuthUser[]>("/api/users"),
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
  getInvite: (token: string) =>
    request<{
      email: string | null;
      emailHint: string;
      serverId: string | null;
      serverName: string | null;
      expiresAt: string | null;
      alreadyLinked: boolean;
    }>(`/api/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    request<{ ok: boolean; serverId: string }>(
      `/api/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST" },
    ),
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
  listAdminActivity: (query: ActivityQuery = {}) =>
    request<ActivityListResponse>(`/api/admin/activity${activityQueryString(query)}`),
};
