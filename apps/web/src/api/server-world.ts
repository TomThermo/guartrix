import { request, withCsrfHeaders } from "./client";

type EngineSettings = {
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
};

type WorldSeed = {
  seed: string | null;
  source: "console" | "properties" | "none";
  propertiesSeed: string | null;
  consoleAvailable: boolean;
  mapUrl: string | null;
  externalMapUrl: string | null;
  mcVersion: string;
};

export const serverWorldApi = {
  resetWorld: (
    id: string,
    body?: {
      dimensions?: Array<"overworld" | "nether" | "end">;
      regenerate?: boolean;
    },
  ) =>
    request<{ deleted: string[]; levelName: string }>(`/api/servers/${id}/world/reset`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  getWorldSeed: (id: string) => request<WorldSeed>(`/api/servers/${id}/world/seed`),
  queryWorldSeed: (id: string) =>
    request<WorldSeed>(`/api/servers/${id}/world/seed/query`, {
      method: "POST",
      body: "{}",
    }),
  importWorld: async (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/servers/${id}/world/import`, {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : res.statusText);
    }
    return data as { levelName: string; path: string };
  },
  getEngineSettings: (id: string) => request<EngineSettings>(`/api/servers/${id}/engine`),
  updateEngineSettings: (id: string, updates: Record<string, boolean | number | string>) =>
    request<EngineSettings>(`/api/servers/${id}/engine`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    }),
  searchModpacks: (
    id: string,
    opts: {
      q?: string;
      source?: string;
      category?: string;
      index?: string;
      offset?: number;
      limit?: number;
    },
  ) => {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.source) params.set("source", opts.source);
    if (opts.category) params.set("category", opts.category);
    if (opts.index) params.set("index", opts.index);
    if (opts.offset != null) params.set("offset", String(opts.offset));
    if (opts.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<{
      hits: Array<Record<string, unknown>>;
      totalHits: number;
      configured?: boolean;
    }>(`/api/servers/${id}/modpacks/search${qs ? `?${qs}` : ""}`);
  },
  listModpackCategories: (id: string) =>
    request<{ categories: Array<{ name: string; label: string }> }>(
      `/api/servers/${id}/modpacks/categories`,
    ),
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
    request<{ installed: string[]; udpPort: number; hint: string }>(`/api/servers/${id}/geyser`, {
      method: "POST",
      body: JSON.stringify({ withFloodgate }),
    }),
  uploadServerIcon: async (id: string, file: Blob) => {
    const body = new FormData();
    body.append("file", file, "server-icon.png");
    const res = await fetch(`/api/servers/${id}/icon`, {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeaders(),
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : res.statusText);
    }
    return data as {
      ok: boolean;
      hasIcon: boolean;
      width: number;
      height: number;
    };
  },
  deleteServerIcon: (id: string) =>
    request<{ ok: boolean; hasIcon: boolean }>(`/api/servers/${id}/icon`, {
      method: "DELETE",
    }),
};
