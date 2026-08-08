import type {
  AddonCategory,
  AddonProjectDetails,
  AddonSearchResponse,
  AddonSortIndex,
  AddonVersionInfo,
  InstalledAddon,
  AddonSyncResult,
  InstalledAddonUpdate,
  ServerType,
} from "@msm/shared";
import { request } from "./client";

export const addonsApi = {
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
  uninstallAddon: (id: string, projectId: string) =>
    request<{ ok: boolean; restartRequired: boolean }>(
      `/api/servers/${id}/addons/${encodeURIComponent(projectId)}`,
      { method: "DELETE" },
    ),
};
