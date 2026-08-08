import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerType } from "@msm/shared";
import type { AddonVersionInfo, ModrinthVersion } from "./addons-modrinth.js";
import {
  MODRINTH_TIMEOUT_MS,
  fetchJson,
  loadersFor,
  mapVersion,
  modrinthUserAgent,
  pickVersion,
} from "./addons-modrinth.js";
import type { AddonKind, InstalledAddon } from "./addons/types.js";
import { addonDir, kindFor, readManifest, writeManifest } from "./addons/manifest.js";
import { listCompatibleVersions } from "./addons/search.js";

const execFileAsync = promisify(execFile);

export interface AddonInstallResult {
  installed: InstalledAddon;
  dependenciesInstalled: InstalledAddon[];
  alreadyPresent: InstalledAddon[];
  restartRequired: true;
}

async function resolveVersion(
  type: ServerType,
  mcVersion: string,
  projectId: string,
  preferredVersionId?: string | null,
): Promise<AddonVersionInfo> {
  const compatible = await listCompatibleVersions(type, mcVersion, projectId);

  if (preferredVersionId) {
    const fromList = compatible.find((v) => v.versionId === preferredVersionId);
    if (fromList) return fromList;

    // Preferred dep version may not match filters — only accept if still compatible.
    try {
      const raw = await fetchJson<ModrinthVersion>(
        `https://api.modrinth.com/v2/version/${preferredVersionId}`,
      );
      const mapped = mapVersion(raw);
      const loaders = loadersFor(type);
      if (
        mapped &&
        raw.game_versions.includes(mcVersion) &&
        raw.loaders.some((l) => loaders.includes(l))
      ) {
        return mapped;
      }
    } catch {
      // fall through to compatible pick
    }
  }

  const chosen = pickVersion(compatible);
  if (!chosen) {
    throw new Error(
      `No Modrinth build found for project ${projectId} (Minecraft ${mcVersion} / ${type})`,
    );
  }
  return chosen;
}

async function downloadJar(url: string, dest: string): Promise<void> {
  const { fetchSafeDownload } = await import("../safe-url.js");
  let res: Response;
  try {
    res = await fetchSafeDownload(url, {
      headers: { "User-Agent": modrinthUserAgent() },
      signal: AbortSignal.timeout(MODRINTH_TIMEOUT_MS * 5),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("Modrinth download timed out — try again");
    }
    throw new Error(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

async function readZipEntry(jarPath: string, entryName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("unzip", ["-p", jarPath, entryName], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Built-in Fabric/Forge ids that are not separate Modrinth mods to install. */
const SKIP_MOD_IDS = new Set([
  "minecraft",
  "java",
  "fabricloader",
  "fabric-loader",
  "fabric",
  "forge",
  "neoforge",
  "quilt_loader",
  "quilt-loader",
]);

/** Well-known Fabric mod ids → Modrinth project id/slug. */
const FABRIC_MOD_ALIASES: Record<string, string> = {
  "fabric-api": "P7dR8mSH",
  "fabric-language-kotlin": "Ha28R6CL",
  "cloth-config": "9s6osm5g",
  "cloth-config2": "9s6osm5g",
  modmenu: "mOgUt4GM",
};

function isInstallableFabricModId(modId: string): boolean {
  if (SKIP_MOD_IDS.has(modId)) return false;
  // fabric-api ships many fabric-* modules inside one jar — don't install those separately.
  if (modId.startsWith("fabric-") && modId !== "fabric-api" && modId !== "fabric-language-kotlin") {
    return false;
  }
  return true;
}

async function resolveModIdToProject(modId: string): Promise<string | null> {
  if (!isInstallableFabricModId(modId)) return null;
  const alias = FABRIC_MOD_ALIASES[modId];
  if (alias) return alias;
  try {
    const project = await fetchJson<{ id: string }>(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(modId)}`,
    );
    return project.id;
  } catch {
    return null;
  }
}

/**
 * Read required dependency mod ids from a Fabric jar's fabric.mod.json.
 * Modrinth often omits these (e.g. JEI has dependencies: [] on Modrinth).
 */
async function fabricDependsFromJar(jarPath: string): Promise<string[]> {
  const raw = await readZipEntry(jarPath, "fabric.mod.json");
  if (!raw) return [];
  try {
    const meta = JSON.parse(raw) as {
      depends?: Record<string, string>;
      recommends?: Record<string, string>;
    };
    return Object.keys(meta.depends ?? {});
  } catch {
    return [];
  }
}

async function downloadToTemp(url: string, fileName: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "guartrix-addon-"));
  const dest = path.join(dir, fileName.replace(/[^\w.-]+/g, "_") || "addon.jar");
  await downloadJar(url, dest);
  return dest;
}

async function installOne(opts: {
  serverDir: string;
  type: ServerType;
  kind: AddonKind;
  dir: string;
  projectId: string;
  version: AddonVersionInfo;
  cachedJarPath?: string;
}): Promise<InstalledAddon> {
  const project = await fetchJson<{
    id: string;
    slug: string;
    title: string;
    description?: string;
    icon_url?: string | null;
    categories?: string[];
  }>(`https://api.modrinth.com/v2/project/${opts.projectId}`);

  let author: string | null = null;
  try {
    const members = await fetchJson<{ user: { username: string }; role: string }[]>(
      `https://api.modrinth.com/v2/project/${opts.projectId}/members`,
    );
    const owner = members.find((m) => m.role.toLowerCase() === "owner") ?? members[0];
    author = owner?.user.username ?? null;
  } catch {
    // ignore
  }

  await fs.mkdir(opts.dir, { recursive: true });
  const dest = path.join(opts.dir, opts.version.fileName);
  if (opts.cachedJarPath) {
    await fs.copyFile(opts.cachedJarPath, dest);
  } else {
    await downloadJar(opts.version.fileUrl, dest);
  }

  const manifest = await readManifest(opts.serverDir);
  const next: InstalledAddon = {
    source: "modrinth",
    kind: opts.kind,
    projectId: project.id,
    slug: project.slug,
    title: project.title,
    versionId: opts.version.versionId,
    versionNumber: opts.version.versionNumber,
    fileName: opts.version.fileName,
    gameVersions: opts.version.gameVersions,
    installedAt: new Date().toISOString(),
    iconUrl: project.icon_url ?? null,
    description: project.description ?? null,
    author,
    categories: project.categories ?? [],
  };

  const filtered = manifest.addons.filter((a) => a.projectId !== project.id);
  const previous = manifest.addons.find((a) => a.projectId === project.id);
  if (previous && previous.fileName !== opts.version.fileName) {
    await fs.rm(path.join(opts.dir, previous.fileName), { force: true }).catch(() => undefined);
  }

  filtered.push(next);
  await writeManifest(opts.serverDir, { addons: filtered });
  return next;
}

/**
 * Install a Modrinth project and recursively install its required dependencies
 * (Modrinth metadata + fabric.mod.json depends, e.g. Fabric API for JEI).
 */
export async function installAddon(opts: {
  serverDir: string;
  type: ServerType;
  mcVersion: string;
  projectId: string;
  versionId?: string;
}): Promise<AddonInstallResult> {
  const kind = kindFor(opts.type);
  const dir = addonDir(opts.serverDir, opts.type);
  if (!kind || !dir) {
    throw new Error("This server type does not support addons");
  }

  type PlanItem = {
    projectId: string;
    version: AddonVersionInfo;
    isRoot: boolean;
    cachedJarPath?: string;
  };

  const plan: PlanItem[] = [];
  const visiting = new Set<string>();
  const plannedIds = new Set<string>();
  const alreadyPresent: InstalledAddon[] = [];
  const tempJars: string[] = [];
  const MAX_DEPTH = 12;

  async function collect(
    projectId: string,
    preferredVersionId: string | null | undefined,
    isRoot: boolean,
    depth: number,
  ): Promise<void> {
    if (depth > MAX_DEPTH) {
      throw new Error("Dependency tree is too deep (possible cycle)");
    }
    if (visiting.has(projectId) || plannedIds.has(projectId)) return;
    visiting.add(projectId);

    const manifest = await readManifest(opts.serverDir);
    const existing = manifest.addons.find((a) => a.projectId === projectId || a.slug === projectId);
    if (existing && !isRoot) {
      alreadyPresent.push(existing);
      visiting.delete(projectId);
      return;
    }

    let version: AddonVersionInfo;
    try {
      version = await resolveVersion(opts.type, opts.mcVersion, projectId, preferredVersionId);
    } catch (err) {
      const project = await fetchJson<{ title?: string; slug?: string }>(
        `https://api.modrinth.com/v2/project/${projectId}`,
      ).catch(() => null);
      const label = project?.title ?? project?.slug ?? projectId;
      throw new Error(
        `Required dependency "${label}" has no compatible build for Minecraft ${opts.mcVersion} / ${opts.type}${
          err instanceof Error ? ` (${err.message})` : ""
        }`,
      );
    }

    // Prefer full version payload (some list responses omit dependency details).
    try {
      const full = await fetchJson<ModrinthVersion>(
        `https://api.modrinth.com/v2/version/${version.versionId}`,
      );
      version = mapVersion(full) ?? version;
    } catch {
      // keep filtered version
    }

    const requiredDeps = (version.dependencies ?? []).filter(
      (d) => d.dependencyType === "required" && d.projectId,
    );
    for (const dep of requiredDeps) {
      await collect(dep.projectId!, dep.versionId, false, depth + 1);
    }

    let cachedJarPath: string | undefined;
    // Modrinth often leaves dependencies empty (JEI). Read fabric.mod.json from the jar.
    if (opts.type === "FABRIC") {
      cachedJarPath = await downloadToTemp(version.fileUrl, version.fileName);
      tempJars.push(cachedJarPath);
      const jarDepends = await fabricDependsFromJar(cachedJarPath);
      for (const modId of jarDepends) {
        const depProject = await resolveModIdToProject(modId);
        if (!depProject) continue;
        await collect(depProject, null, false, depth + 1);
      }
    }

    if (!plannedIds.has(projectId)) {
      plannedIds.add(projectId);
      plan.push({ projectId, version, isRoot, cachedJarPath });
    }
    visiting.delete(projectId);
  }

  try {
    await collect(opts.projectId, opts.versionId, true, 0);

    const installedItems: InstalledAddon[] = [];
    let root: InstalledAddon | null = null;
    for (const item of plan) {
      const installed = await installOne({
        serverDir: opts.serverDir,
        type: opts.type,
        kind,
        dir,
        projectId: item.projectId,
        version: item.version,
        cachedJarPath: item.cachedJarPath,
      });
      if (item.isRoot) root = installed;
      else installedItems.push(installed);
    }

    if (!root) {
      throw new Error("Install produced no addons");
    }

    return {
      installed: root,
      dependenciesInstalled: installedItems,
      alreadyPresent: alreadyPresent.filter(
        (a, i, arr) => arr.findIndex((x) => x.projectId === a.projectId) === i,
      ),
      restartRequired: true,
    };
  } finally {
    for (const jar of tempJars) {
      await fs.rm(path.dirname(jar), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function uninstallAddon(
  serverDir: string,
  type: ServerType,
  projectId: string,
): Promise<void> {
  const dir = addonDir(serverDir, type);
  if (!dir) throw new Error("This server type does not support addons");

  const manifest = await readManifest(serverDir);
  const addon = manifest.addons.find((a) => a.projectId === projectId);
  if (!addon) throw new Error("Addon not found in manifest");

  await fs.rm(path.join(dir, addon.fileName), { force: true });
  await writeManifest(serverDir, {
    addons: manifest.addons.filter((a) => a.projectId !== projectId),
  });
}
