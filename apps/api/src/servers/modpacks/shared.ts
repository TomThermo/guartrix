import type { ServerType } from "@guartrix/shared";
import { processManager } from "../process-manager.js";
import { categoryLabel, LOADER_CATEGORY_NAMES } from "../addons-modrinth.js";

export const MODRINTH_TIMEOUT_MS = 30_000;

export function modrinthUa(): string {
  const base =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.PUBLIC_HOST?.trim() ||
    "https://guartrix.com";
  return `Guartrix/1.0 (${base}; admin@guartrix.com)`;
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": modrinthUa(), ...headers },
    signal: AbortSignal.timeout(MODRINTH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function assertStopped(serverId: string, status: string): void {
  if (
    processManager.isRunning(serverId) ||
    status === "RUNNING" ||
    status === "STARTING" ||
    status === "STOPPING"
  ) {
    throw new Error("Stop the server before installing a modpack");
  }
}

export function loaderFacet(type: ServerType): string[] {
  switch (type) {
    case "FABRIC":
      return ["fabric"];
    case "QUILT":
      return ["quilt", "fabric"];
    case "FORGE":
      return ["forge"];
    case "NEOFORGE":
      return ["neoforge"];
    default:
      return [];
  }
}

export const MODPACK_SORT = ["relevance", "downloads", "follows", "newest", "updated"] as const;
export type ModpackSortIndex = (typeof MODPACK_SORT)[number];

export async function listModpackCategories(): Promise<Array<{ name: string; label: string }>> {
  const tags = await fetchJson<{ name: string; project_type: string; header: string }[]>(
    "https://api.modrinth.com/v2/tag/category",
  );
  const filtered = tags.filter(
    (t) =>
      t.project_type === "modpack" &&
      t.header === "categories" &&
      !LOADER_CATEGORY_NAMES.has(t.name),
  );
  const seen = new Set<string>();
  const out: Array<{ name: string; label: string }> = [];
  for (const tag of filtered) {
    if (seen.has(tag.name)) continue;
    seen.add(tag.name);
    out.push({ name: tag.name, label: categoryLabel(tag.name) });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function downloadToFile(url: string, dest: string): Promise<void> {
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");
  const { fetchSafeDownload } = await import("../../safe-url.js");
  const res = await fetchSafeDownload(url, {
    headers: { "User-Agent": modrinthUa() },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}
