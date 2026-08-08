import type { ServerDatabase, ServerDatabasesResponse } from "@msm/shared";
import { request, withCsrfHeaders } from "./client";

type ProxySetup = {
  supported: boolean;
  mode: "none" | "velocity" | "bungeecord";
  onlineMode: boolean;
  preventProxyConnections: boolean;
  velocitySecret: string;
  checklist: Array<{ id: string; label: string; ok: boolean }>;
};

export const serverResourcesApi = {
  getConsoleFavorites: (id: string) =>
    request<{ commands: string[] }>(`/api/servers/${id}/console-favorites`),
  setConsoleFavorites: (id: string, commands: string[]) =>
    request<{ commands: string[] }>(`/api/servers/${id}/console-favorites`, {
      method: "PUT",
      body: JSON.stringify({ commands }),
    }),
  listDatabases: (id: string) => request<ServerDatabasesResponse>(`/api/servers/${id}/databases`),
  createDatabase: (id: string, body?: { name?: string }) =>
    request<{ database: ServerDatabase }>(`/api/servers/${id}/databases`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  deleteDatabase: (id: string, dbId: string) =>
    request<void>(`/api/servers/${id}/databases/${encodeURIComponent(dbId)}`, {
      method: "DELETE",
    }),
  getProxySetup: (id: string) => request<ProxySetup>(`/api/servers/${id}/proxy`),
  applyProxySetup: (id: string, mode: "none" | "velocity" | "bungeecord") =>
    request<ProxySetup>(`/api/servers/${id}/proxy`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
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
      headers: withCsrfHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : res.statusText);
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
