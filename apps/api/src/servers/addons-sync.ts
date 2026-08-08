import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { AddonSyncResult, ServerType } from "@msm/shared";
import type { ModrinthVersion } from "./addons-modrinth.js";
import { fetchJson, mapVersion } from "./addons-modrinth.js";
import type { InstalledAddon } from "./addons/types.js";
import { addonDir, kindFor, readManifest, writeManifest } from "./addons/manifest.js";

async function sha512File(filePath: string): Promise<string> {
  const hash = createHash("sha512");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function localProjectId(fileName: string): string {
  return `local:${fileName}`;
}

function isJarName(name: string): boolean {
  return name.toLowerCase().endsWith(".jar") && !name.startsWith(".");
}

/**
 * Rescan mods/ or plugins/ and reconcile guartrix-addons.json with jars on disk.
 * Matches files via Modrinth SHA-512 (`version_files`); unmatched jars are kept
 * as `source: "local"` so they still appear in the panel.
 */
export async function syncInstalledAddons(
  serverDir: string,
  type: ServerType,
): Promise<AddonSyncResult> {
  const kind = kindFor(type);
  const dir = addonDir(serverDir, type);
  if (!kind || !dir) {
    throw new Error("This server type does not support addons");
  }

  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const jars = entries
    .filter((e) => e.isFile() && isJarName(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const previous = await readManifest(serverDir);
  const prevByFile = new Map(previous.addons.map((a) => [a.fileName, a]));
  const prevByProject = new Map(previous.addons.map((a) => [a.projectId, a]));

  const hashByFile = new Map<string, string>();
  for (const fileName of jars) {
    hashByFile.set(fileName, await sha512File(path.join(dir, fileName)));
  }

  const hashes = [...new Set(hashByFile.values())];
  const versionByHash = new Map<string, ModrinthVersion & { project_id: string }>();
  /** True when Modrinth answered at least one request (even empty). */
  let modrinthReachable = false;

  // Modrinth accepts up to 1000 hashes per request; we batch by 100.
  for (let i = 0; i < hashes.length; i += 100) {
    const chunk = hashes.slice(i, i + 100);
    if (chunk.length === 0) continue;
    try {
      const found = await fetchJson<Record<string, ModrinthVersion & { project_id: string }>>(
        "https://api.modrinth.com/v2/version_files",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hashes: chunk, algorithm: "sha512" }),
        },
      );
      modrinthReachable = true;
      for (const [hash, version] of Object.entries(found ?? {})) {
        if (version?.project_id) versionByHash.set(hash, version);
      }
    } catch (err) {
      console.warn(
        "[addons] version_files batch failed:",
        err instanceof Error ? err.message : err,
      );
      for (const hash of chunk) {
        try {
          const version = await fetchJson<ModrinthVersion & { project_id: string }>(
            `https://api.modrinth.com/v2/version_file/${hash}?algorithm=sha512`,
          );
          modrinthReachable = true;
          if (version?.project_id) versionByHash.set(hash, version);
        } catch (lookupErr) {
          const msg = lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
          // 404 = not on Modrinth (reachable). Network/5xx = keep previous metadata.
          if (/Modrinth HTTP 404/.test(msg)) modrinthReachable = true;
        }
      }
    }
  }

  type Candidate = {
    fileName: string;
    hash: string;
    version: ModrinthVersion & { project_id: string };
    mtimeMs: number;
    size: number;
  };
  const byProject = new Map<string, Candidate[]>();
  const unmatchedFiles: string[] = [];

  for (const fileName of jars) {
    const hash = hashByFile.get(fileName)!;
    const version = versionByHash.get(hash);
    if (!version) {
      unmatchedFiles.push(fileName);
      continue;
    }
    const st = await fs.stat(path.join(dir, fileName));
    const list = byProject.get(version.project_id) ?? [];
    list.push({
      fileName,
      hash,
      version,
      mtimeMs: st.mtimeMs,
      size: st.size,
    });
    byProject.set(version.project_id, list);
  }

  const duplicates: string[] = [];
  const nextAddons: InstalledAddon[] = [];
  const projectCache = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      description?: string;
      icon_url?: string | null;
      categories?: string[];
      author: string | null;
    }
  >();

  async function loadProject(projectId: string) {
    const cached = projectCache.get(projectId);
    if (cached) return cached;
    const project = await fetchJson<{
      id: string;
      slug: string;
      title: string;
      description?: string;
      icon_url?: string | null;
      categories?: string[];
    }>(`https://api.modrinth.com/v2/project/${projectId}`);
    let author: string | null = null;
    try {
      const members = await fetchJson<{ user: { username: string }; role: string }[]>(
        `https://api.modrinth.com/v2/project/${projectId}/members`,
      );
      const owner = members.find((m) => m.role.toLowerCase() === "owner") ?? members[0];
      author = owner?.user.username ?? null;
    } catch {
      // ignore
    }
    const row = {
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      icon_url: project.icon_url,
      categories: project.categories,
      author,
    };
    projectCache.set(projectId, row);
    return row;
  }

  for (const [projectId, candidates] of byProject) {
    candidates.sort((a, b) => {
      const aPrimary =
        a.version.files.find((f) => f.primary)?.filename === a.fileName ||
        a.version.files.some((f) => f.filename === a.fileName)
          ? 1
          : 0;
      const bPrimary =
        b.version.files.find((f) => f.primary)?.filename === b.fileName ||
        b.version.files.some((f) => f.filename === b.fileName)
          ? 1
          : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return b.size - a.size;
    });
    const chosen = candidates[0]!;
    for (const extra of candidates.slice(1)) {
      duplicates.push(extra.fileName);
    }

    const project = await loadProject(projectId);
    const mapped = mapVersion(chosen.version);
    const prev = prevByFile.get(chosen.fileName) ?? prevByProject.get(project.id) ?? null;
    nextAddons.push({
      source: "modrinth",
      kind,
      projectId: project.id,
      slug: project.slug,
      title: project.title,
      versionId: chosen.version.id,
      versionNumber: mapped?.versionNumber ?? chosen.version.version_number,
      fileName: chosen.fileName,
      gameVersions: mapped?.gameVersions ?? chosen.version.game_versions ?? [],
      installedAt: prev?.installedAt ?? new Date().toISOString(),
      iconUrl: project.icon_url ?? null,
      description: project.description ?? null,
      author: project.author,
      categories: project.categories ?? [],
    });
  }

  for (const fileName of unmatchedFiles) {
    const prev = prevByFile.get(fileName);
    // If Modrinth was unreachable, keep previous Modrinth metadata for known jars.
    if (prev?.source === "modrinth" && !modrinthReachable) {
      if (!nextAddons.some((a) => a.projectId === prev.projectId)) {
        nextAddons.push({ ...prev, kind, fileName });
      } else {
        duplicates.push(fileName);
      }
      continue;
    }
    const base = fileName.replace(/\.jar$/i, "");
    nextAddons.push({
      source: "local",
      kind,
      projectId: prev?.source === "local" ? prev.projectId : localProjectId(fileName),
      slug: prev?.slug ?? base,
      title: prev?.title && prev.source === "local" ? prev.title : base,
      versionId: "",
      versionNumber: "local",
      fileName,
      gameVersions: [],
      installedAt: prev?.installedAt ?? new Date().toISOString(),
      iconUrl: null,
      description: "Present on disk; not found on Modrinth (hash mismatch).",
      author: null,
      categories: [],
    });
  }

  nextAddons.sort((a, b) => a.title.localeCompare(b.title));

  const prevKeys = new Set(previous.addons.map((a) => `${a.projectId}\0${a.fileName}`));
  const nextKeys = new Set(nextAddons.map((a) => `${a.projectId}\0${a.fileName}`));
  const added = nextAddons.filter((a) => !prevKeys.has(`${a.projectId}\0${a.fileName}`));
  const removed = previous.addons.filter((a) => !nextKeys.has(`${a.projectId}\0${a.fileName}`));

  await writeManifest(serverDir, { addons: nextAddons });

  return {
    installed: nextAddons,
    added,
    removed,
    duplicates,
    folder: kind === "plugin" ? "plugins" : "mods",
    jarCount: jars.length,
  };
}
