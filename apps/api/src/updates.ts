import type { Server } from "@prisma/client";
import type { ServerType, ServerUpdateInfo } from "@msm/shared";
import { serverDir } from "./config.js";
import { prisma } from "./db.js";
import { processManager, fixDataOwnership } from "./process-manager.js";
import {
  compareVersionsAsc,
  getLatestFabricLoader,
  getLatestForgeFullVersion,
  getLatestNeoForgeFullVersion,
  getLatestPaperBuild,
  getLatestPurpurBuild,
  getLatestQuiltLoader,
  listVersions,
  replaceServerRuntime,
} from "./providers/jars.js";

const versionCache = new Map<string, { at: number; versions: string[] }>();
const channelCache = new Map<string, { at: number; label: string | null; raw: string | number | null }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function cachedVersions(type: ServerType): Promise<string[]> {
  const key = type;
  const hit = versionCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.versions;
  const versions = await listVersions(type);
  versionCache.set(key, { at: Date.now(), versions });
  return versions;
}

async function cachedLatestPaperBuild(mcVersion: string): Promise<number | null> {
  const key = `paper:${mcVersion}`;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return typeof hit.raw === "number" ? hit.raw : null;
  }
  const build = await getLatestPaperBuild(mcVersion);
  channelCache.set(key, {
    at: Date.now(),
    label: build != null ? `build ${build}` : null,
    raw: build,
  });
  return build;
}

async function cachedLatestPurpurBuild(mcVersion: string): Promise<number | null> {
  const key = `purpur:${mcVersion}`;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return typeof hit.raw === "number" ? hit.raw : null;
  }
  const build = await getLatestPurpurBuild(mcVersion);
  channelCache.set(key, {
    at: Date.now(),
    label: build != null ? `build ${build}` : null,
    raw: build,
  });
  return build;
}

async function cachedLatestFabricLoader(mcVersion: string): Promise<string | null> {
  const key = `fabric:${mcVersion}`;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return typeof hit.raw === "string" ? hit.raw : null;
  }
  const loader = await getLatestFabricLoader(mcVersion);
  channelCache.set(key, {
    at: Date.now(),
    label: loader ? `loader ${loader}` : null,
    raw: loader,
  });
  return loader;
}

async function cachedLatestQuiltLoader(mcVersion: string): Promise<string | null> {
  const key = `quilt:${mcVersion}`;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return typeof hit.raw === "string" ? hit.raw : null;
  }
  const loader = await getLatestQuiltLoader(mcVersion);
  channelCache.set(key, {
    at: Date.now(),
    label: loader ? `loader ${loader}` : null,
    raw: loader,
  });
  return loader;
}

async function cachedLatestForge(mcVersion: string): Promise<string | null> {
  const key = `forge:${mcVersion}`;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return typeof hit.raw === "string" ? hit.raw : null;
  }
  const forge = await getLatestForgeFullVersion(mcVersion);
  channelCache.set(key, { at: Date.now(), label: forge, raw: forge });
  return forge;
}

async function cachedLatestNeoForge(mcVersion: string): Promise<string | null> {
  const key = `neoforge:${mcVersion}`;
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return typeof hit.raw === "string" ? hit.raw : null;
  }
  const neo = await getLatestNeoForgeFullVersion(mcVersion);
  channelCache.set(key, { at: Date.now(), label: neo, raw: neo });
  return neo;
}

function channelLabel(
  type: ServerType,
  paperBuild: number | null,
  fabricLoader: string | null,
  forgeVersion: string | null,
): string | null {
  if ((type === "PAPER" || type === "PURPUR") && paperBuild != null) {
    return `build ${paperBuild}`;
  }
  if ((type === "FABRIC" || type === "QUILT") && fabricLoader) {
    return `loader ${fabricLoader}`;
  }
  if ((type === "FORGE" || type === "NEOFORGE") && forgeVersion) {
    return forgeVersion;
  }
  return null;
}

export async function checkServerUpdate(server: Server): Promise<ServerUpdateInfo> {
  const versions = await cachedVersions(server.type);
  const latestMcVersion = versions[0] ?? server.mcVersion;
  const mcUpdateAvailable =
    versions.length > 0 &&
    compareVersionsAsc(server.mcVersion, latestMcVersion) < 0;

  let channelUpdateAvailable = false;
  let latestChannelLabel: string | null = null;
  const currentChannelLabel = channelLabel(
    server.type,
    server.paperBuild,
    server.fabricLoaderVersion,
    server.forgeVersion,
  );

  if (server.type === "PAPER") {
    const latestBuild = await cachedLatestPaperBuild(server.mcVersion);
    if (latestBuild != null) {
      latestChannelLabel = `build ${latestBuild}`;
      channelUpdateAvailable =
        server.paperBuild == null || latestBuild > server.paperBuild;
    }
  } else if (server.type === "PURPUR") {
    const latestBuild = await cachedLatestPurpurBuild(server.mcVersion);
    if (latestBuild != null) {
      latestChannelLabel = `build ${latestBuild}`;
      channelUpdateAvailable =
        server.paperBuild == null || latestBuild > server.paperBuild;
    }
  } else if (server.type === "FABRIC") {
    const latestLoader = await cachedLatestFabricLoader(server.mcVersion);
    if (latestLoader) {
      latestChannelLabel = `loader ${latestLoader}`;
      channelUpdateAvailable =
        !server.fabricLoaderVersion ||
        compareVersionsAsc(server.fabricLoaderVersion, latestLoader) < 0;
    }
  } else if (server.type === "QUILT") {
    const latestLoader = await cachedLatestQuiltLoader(server.mcVersion);
    if (latestLoader) {
      latestChannelLabel = `loader ${latestLoader}`;
      channelUpdateAvailable =
        !server.fabricLoaderVersion ||
        compareVersionsAsc(server.fabricLoaderVersion, latestLoader) < 0;
    }
  } else if (server.type === "FORGE") {
    const latestForge = await cachedLatestForge(server.mcVersion);
    if (latestForge) {
      latestChannelLabel = latestForge;
      const currentBuild = server.forgeVersion?.split("-").slice(1).join("-") ?? "";
      const latestBuild = latestForge.split("-").slice(1).join("-");
      channelUpdateAvailable =
        !server.forgeVersion ||
        compareVersionsAsc(currentBuild, latestBuild) < 0;
    }
  } else if (server.type === "NEOFORGE") {
    const latestNeo = await cachedLatestNeoForge(server.mcVersion);
    if (latestNeo) {
      latestChannelLabel = latestNeo;
      channelUpdateAvailable =
        !server.forgeVersion ||
        compareVersionsAsc(server.forgeVersion, latestNeo) < 0;
    }
  }
  // Vanilla has no channel update — only MC version

  const available = channelUpdateAvailable || mcUpdateAvailable;

  const parts: string[] = [];
  if (channelUpdateAvailable && currentChannelLabel && latestChannelLabel) {
    parts.push(
      `${server.type} ${currentChannelLabel} → ${latestChannelLabel} (${server.mcVersion})`,
    );
  } else if (channelUpdateAvailable && latestChannelLabel) {
    parts.push(`New ${server.type} ${latestChannelLabel} for ${server.mcVersion}`);
  }
  if (mcUpdateAvailable) {
    parts.push(`Minecraft ${server.mcVersion} → ${latestMcVersion}`);
  }

  return {
    serverId: server.id,
    type: server.type,
    available,
    currentMcVersion: server.mcVersion,
    latestMcVersion,
    mcUpdateAvailable,
    channelUpdateAvailable,
    currentChannelLabel,
    latestChannelLabel,
    suggestedMcVersion: channelUpdateAvailable
      ? server.mcVersion
      : mcUpdateAvailable
        ? latestMcVersion
        : server.mcVersion,
    message: parts.join(" · ") || "Up to date",
  };
}

export async function checkAllServerUpdates(
  serverIds?: string[],
): Promise<Record<string, ServerUpdateInfo>> {
  const servers = await prisma.server.findMany({
    where: serverIds && serverIds.length > 0 ? { id: { in: serverIds } } : undefined,
  });
  const entries = await Promise.all(
    servers.map(async (s) => [s.id, await checkServerUpdate(s)] as const),
  );
  return Object.fromEntries(entries);
}

export async function applyServerUpdate(
  serverId: string,
  targetMcVersion?: string,
): Promise<{ server: Server; update: ServerUpdateInfo }> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });

  if (processManager.isRunning(server.id) || server.status === "RUNNING" || server.status === "STARTING") {
    throw new Error("Stop the server before updating");
  }

  const info = await checkServerUpdate(server);
  const mcVersion = (targetMcVersion?.trim() || info.suggestedMcVersion).trim();

  const versions = await cachedVersions(server.type);
  if (!versions.includes(mcVersion)) {
    throw new Error(`Version ${mcVersion} is not available for ${server.type}`);
  }

  // Changing MC version when not needed / not available as update is still allowed
  // if explicitly requested and in the version list.

  const dir = serverDir(server.id);
  await fixDataOwnership(dir);

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "CREATING", errorMessage: null },
  });

  try {
    const { createBackup } = await import("./backups.js");
    await createBackup({
      serverId: server.id,
      trigger: "manual",
      note: `Pre-update ${server.mcVersion} → ${mcVersion}`,
    });

    const prepared = await replaceServerRuntime(server.type, mcVersion, dir);
    const updated = await prisma.server.update({
      where: { id: server.id },
      data: {
        status: "STOPPED",
        mcVersion,
        paperBuild: prepared.paperBuild ?? null,
        fabricLoaderVersion: prepared.fabricLoaderVersion ?? null,
        forgeVersion: prepared.forgeVersion ?? null,
        errorMessage: null,
      },
    });
    const update = await checkServerUpdate(updated);
    return { server: updated, update };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "ERROR", errorMessage: `Update failed: ${message}` },
    });
    throw err;
  }
}
