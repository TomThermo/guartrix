import type { AddonVersionInfo, ServerType } from "@msm/shared";

/** Modrinth requires a descriptive UA; keep requests from hanging the panel. */
export const MODRINTH_TIMEOUT_MS = 12_000;
export const MODRINTH_MAX_ATTEMPTS = 2;

export function modrinthUserAgent(): string {
  const base =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.PUBLIC_HOST?.trim() ||
    "https://guartrix.com";
  const host = base.replace(/^https?:\/\//, "").split("/")[0] || "guartrix.com";
  return `Guartrix/1.0 (${base}; admin@${host})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableModrinthStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export type { AddonVersionInfo };

export type ModrinthVersion = {
  id: string;
  version_number: string;
  name: string;
  game_versions: string[];
  loaders: string[];
  version_type: string;
  changelog?: string | null;
  date_published?: string | null;
  dependencies?: {
    project_id: string | null;
    version_id: string | null;
    dependency_type: string;
  }[];
  files: {
    url: string;
    filename: string;
    size: number;
    primary: boolean;
  }[];
};

export function mapVersion(v: ModrinthVersion): AddonVersionInfo | null {
  const file = v.files.find((f) => f.primary) ?? v.files[0];
  if (!file) return null;
  return {
    versionId: v.id,
    versionNumber: v.version_number,
    name: v.name,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    fileName: file.filename,
    fileUrl: file.url,
    fileSize: file.size,
    releaseChannel: v.version_type,
    changelog: v.changelog ?? null,
    datePublished: v.date_published ?? null,
    dependencies: (v.dependencies ?? []).map((d) => ({
      projectId: d.project_id,
      versionId: d.version_id,
      dependencyType: d.dependency_type,
    })),
  };
}

export function pickVersion(
  versions: AddonVersionInfo[],
  preferredVersionId?: string | null,
): AddonVersionInfo | null {
  if (!versions.length) return null;
  return (
    (preferredVersionId ? versions.find((v) => v.versionId === preferredVersionId) : null) ??
    versions.find((v) => v.releaseChannel === "release") ??
    versions[0]
  );
}

export const LOADER_CATEGORY_NAMES = new Set([
  "fabric",
  "forge",
  "neoforge",
  "quilt",
  "paper",
  "spigot",
  "bukkit",
  "purpur",
  "folia",
  "sponge",
  "bungeecord",
  "velocity",
  "waterfall",
  "datapack",
  "liteloader",
  "rift",
]);

export function loadersFor(type: ServerType): string[] {
  if (type === "PAPER" || type === "PURPUR") {
    return ["paper", "bukkit", "spigot", "purpur", "folia"];
  }
  if (type === "FABRIC") return ["fabric"];
  if (type === "QUILT") return ["quilt", "fabric"];
  if (type === "FORGE") return ["forge"];
  if (type === "NEOFORGE") return ["neoforge"];
  return [];
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { retries?: number },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", modrinthUserAgent());
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const maxAttempts = Math.max(1, init?.retries ?? MODRINTH_MAX_ATTEMPTS);
  const { retries: _retries, ...fetchInit } = init ?? {};
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (fetchInit.signal?.aborted) {
      throw new Error("Modrinth request cancelled");
    }

    const timeout = AbortSignal.timeout(MODRINTH_TIMEOUT_MS);
    const signal = fetchInit.signal ? AbortSignal.any([fetchInit.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(url, { ...fetchInit, headers, signal });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (fetchInit.signal?.aborted) {
        throw new Error("Modrinth request cancelled");
      }
      if (name === "TimeoutError" || name === "AbortError") {
        lastError = new Error(
          `Modrinth timed out after ${Math.round(MODRINTH_TIMEOUT_MS / 1000)}s — try again`,
        );
      } else {
        lastError = new Error(
          `Modrinth unreachable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      return res.json() as Promise<T>;
    }

    const bodyText = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(bodyText) as { description?: string; error?: string };
      detail = parsed.description || parsed.error || "";
    } catch {
      // ignore non-JSON error bodies (e.g. Cloudflare HTML)
    }

    if (res.status === 429) {
      lastError = new Error("Modrinth rate limit — wait a moment and try again");
    } else if (isRetryableModrinthStatus(res.status)) {
      lastError = new Error(
        detail
          ? `Modrinth temporarily unavailable (${res.status}: ${detail})`
          : `Modrinth temporarily unavailable (HTTP ${res.status})`,
      );
    } else {
      throw new Error(
        detail ? `Modrinth HTTP ${res.status}: ${detail}` : `Modrinth HTTP ${res.status}`,
      );
    }

    if (attempt < maxAttempts && isRetryableModrinthStatus(res.status)) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5_000)
          : 300 * attempt,
      );
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("Modrinth request failed");
}

export function categoryLabel(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
