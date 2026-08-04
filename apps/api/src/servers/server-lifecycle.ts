import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { Server } from "@prisma/client";
import {
  ALL_SERVER_TYPES,
  addonKindFor,
  type ServerType,
} from "@msm/shared";
import { createBackup } from "./backups.js";
import {
  daemonDeleteFile,
  daemonDecompressFile,
  daemonExportArchiveToFile,
  daemonListFiles,
  daemonRename,
  daemonWriteFile,
} from "../nodes/daemon-client.js";
import { prisma } from "../db.js";
import { saveUpload } from "./files.js";
import { listVersions } from "../providers/jars.js";
import { processManager } from "./process-manager.js";
import { readServerProperties, updateServerProperties } from "./properties.js";
import {
  prepareServerOnNode,
  replaceRuntimeOnNode,
  syncLocalDirToNode,
  wipeServerEverywhere,
} from "./server-files.js";
import { checkServerUpdate } from "./updates.js";

export type WorldDimension = "overworld" | "nether" | "end";

function assertStopped(server: Server): void {
  if (
    processManager.isRunning(server.id) ||
    server.status === "RUNNING" ||
    server.status === "STARTING" ||
    server.status === "STOPPING" ||
    server.status === "TRANSFERRING"
  ) {
    throw new Error("Stop the server before continuing");
  }
}

function requireNodeId(server: Server): string {
  if (!server.nodeId) throw new Error("Server has no node assigned");
  return server.nodeId;
}

function addonRelDir(type: ServerType): string | null {
  const kind = addonKindFor(type);
  if (kind === "plugin") return "plugins";
  if (kind === "mod") return "mods";
  return null;
}

/** Cross-ecosystem switches require wiping plugins/mods. */
export function changeTypeRequiresWipeAddons(
  from: ServerType,
  to: ServerType,
): boolean {
  const a = addonKindFor(from);
  const b = addonKindFor(to);
  if (!a || !b) return a !== b;
  return a !== b;
}

async function wipeAddonDir(serverId: string, type: ServerType): Promise<void> {
  const rel = addonRelDir(type);
  if (!rel) return;
  await daemonDeleteFile(serverId, rel).catch(() => undefined);
  await daemonDeleteFile(serverId, "guartrix-addons.json").catch(() => undefined);
}

function worldPaths(
  levelName: string,
  dimensions: WorldDimension[],
): string[] {
  const paths: string[] = [];
  for (const d of dimensions) {
    if (d === "overworld") paths.push(levelName);
    else if (d === "nether") paths.push(`${levelName}_nether`);
    else if (d === "end") paths.push(`${levelName}_the_end`);
  }
  return paths;
}

async function markMeta(
  serverId: string,
  prepared: {
    paperBuild?: number;
    fabricLoaderVersion?: string;
    forgeVersion?: string;
  },
  extra: Record<string, unknown> = {},
): Promise<Server> {
  return prisma.server.update({
    where: { id: serverId },
    data: {
      status: "STOPPED",
      paperBuild: prepared.paperBuild ?? null,
      fabricLoaderVersion: prepared.fabricLoaderVersion ?? null,
      forgeVersion: prepared.forgeVersion ?? null,
      errorMessage: null,
      ...extra,
    },
  });
}

/**
 * Full wipe then re-prepare. Optionally restore plugins/mods from a pre-wipe export.
 */
async function wipeAndPrepare(
  server: Server,
  restoreAddonsFromExport: string | null,
): Promise<Server> {
  await wipeServerEverywhere(server.id);
  const prepared = await prepareServerOnNode({
    serverId: server.id,
    nodeId: requireNodeId(server),
    type: server.type as ServerType,
    mcVersion: server.mcVersion,
    port: server.port,
  });

  if (restoreAddonsFromExport) {
    const rel = addonRelDir(server.type as ServerType);
    if (rel) {
      const extractDir = await fs.mkdtemp(
        path.join(os.tmpdir(), `guartrix-extract-${server.id}-`),
      );
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        await promisify(execFile)("tar", [
          "-xzf",
          restoreAddonsFromExport,
          "-C",
          extractDir,
        ], { maxBuffer: 64 * 1024 * 1024 });
        const srcAddon = path.join(extractDir, rel);
        try {
          await fs.access(srcAddon);
          const stage = await fs.mkdtemp(
            path.join(os.tmpdir(), `guartrix-addon-stage-${server.id}-`),
          );
          await fs.cp(srcAddon, path.join(stage, rel), { recursive: true });
          try {
            await fs.copyFile(
              path.join(extractDir, "guartrix-addons.json"),
              path.join(stage, "guartrix-addons.json"),
            );
          } catch {
            /* no manifest */
          }
          await syncLocalDirToNode(server.id, requireNodeId(server), stage);
          await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
        } catch {
          /* no addons */
        }
      } finally {
        await fs.rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  return markMeta(server.id, prepared);
}

export async function reinstallServer(
  serverId: string,
  opts: { keepWorld: boolean; keepAddons?: boolean },
): Promise<Server> {
  const keepAddons = opts.keepAddons !== false;
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  assertStopped(server);

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "CREATING", errorMessage: null },
  });

  try {
    await createBackup({
      serverId: server.id,
      trigger: "manual",
      note: `Pre-reinstall (keepWorld=${opts.keepWorld}, keepAddons=${keepAddons})`,
    });

    if (!opts.keepWorld) {
      let exportPath: string | null = null;
      if (keepAddons && addonRelDir(server.type as ServerType)) {
        exportPath = path.join(
          os.tmpdir(),
          `guartrix-pre-reinstall-${server.id}-${Date.now()}.tar.gz`,
        );
        await daemonExportArchiveToFile(server.id, exportPath);
      }
      try {
        return await wipeAndPrepare(server, exportPath);
      } finally {
        if (exportPath) {
          await fs.rm(exportPath, { force: true }).catch(() => undefined);
        }
      }
    }

    // keepWorld: refresh jar/runtime only
    const prepared = await replaceRuntimeOnNode({
      serverId: server.id,
      nodeId: requireNodeId(server),
      type: server.type as ServerType,
      mcVersion: server.mcVersion,
    });
    if (!keepAddons) {
      await wipeAddonDir(server.id, server.type as ServerType);
    }
    await daemonWriteFile(server.id, "eula.txt", "eula=true\n").catch(() => undefined);
    return markMeta(server.id, prepared);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "ERROR", errorMessage: `Reinstall failed: ${message}` },
    });
    throw err;
  }
}

export async function changeServerType(
  serverId: string,
  opts: { type: ServerType; mcVersion: string; wipeAddons: boolean },
): Promise<Server> {
  if (!(ALL_SERVER_TYPES as readonly string[]).includes(opts.type)) {
    throw new Error("Invalid server type");
  }
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  assertStopped(server);

  const versions = await listVersions(opts.type);
  if (!versions.includes(opts.mcVersion)) {
    throw new Error(`Version ${opts.mcVersion} is not available for ${opts.type}`);
  }

  const requiresWipe = changeTypeRequiresWipeAddons(
    server.type as ServerType,
    opts.type,
  );
  if (requiresWipe && !opts.wipeAddons) {
    throw new Error(
      "Changing between plugin and mod loaders requires wiping plugins/mods (set wipeAddons: true)",
    );
  }

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "CREATING", errorMessage: null },
  });

  try {
    await createBackup({
      serverId: server.id,
      trigger: "manual",
      note: `Pre-type-change ${server.type} → ${opts.type} (${opts.mcVersion})`,
    });

    if (opts.wipeAddons || requiresWipe) {
      await wipeAddonDir(server.id, server.type as ServerType);
      if (opts.type !== server.type) {
        await wipeAddonDir(server.id, opts.type);
      }
    }

    const prepared = await replaceRuntimeOnNode({
      serverId: server.id,
      nodeId: requireNodeId(server),
      type: opts.type,
      mcVersion: opts.mcVersion,
    });
    await daemonWriteFile(server.id, "eula.txt", "eula=true\n").catch(() => undefined);

    return markMeta(server.id, prepared, {
      type: opts.type,
      mcVersion: opts.mcVersion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "ERROR", errorMessage: `Type change failed: ${message}` },
    });
    throw err;
  }
}

export async function resetWorld(
  serverId: string,
  opts: {
    dimensions?: WorldDimension[];
    regenerate?: boolean;
  },
): Promise<{ deleted: string[]; levelName: string }> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  assertStopped(server);

  const props = await readServerProperties(server.id);
  const levelName = (props["level-name"] || "world").trim() || "world";
  const dimensions: WorldDimension[] =
    opts.dimensions?.length
      ? opts.dimensions
      : ["overworld", "nether", "end"];

  await createBackup({
    serverId: server.id,
    trigger: "manual",
    note: `Pre-world-reset (${dimensions.join(",")})`,
  });

  const deleted: string[] = [];
  for (const p of worldPaths(levelName, dimensions)) {
    try {
      await daemonDeleteFile(server.id, p);
      deleted.push(p);
    } catch {
      /* missing is fine */
    }
  }

  void opts.regenerate;
  return { deleted, levelName };
}

export async function importWorldZip(
  serverId: string,
  opts: { archiveRelPath?: string; buffer?: Buffer; fileName?: string },
): Promise<{ levelName: string; path: string }> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  assertStopped(server);

  const props = await readServerProperties(server.id);
  const levelName = (props["level-name"] || "world").trim() || "world";

  await createBackup({
    serverId: server.id,
    trigger: "manual",
    note: `Pre-world-import → ${levelName}`,
  });

  let archivePath = opts.archiveRelPath?.replace(/^\/+/, "") ?? "";
  if (opts.buffer) {
    const name = (opts.fileName || "world-upload.zip").replace(/[^\w.\-]+/g, "_");
    const uploaded = await saveUpload(
      server.id,
      "",
      `__guartrix_world_upload_${Date.now()}_${name}`,
      Readable.from(opts.buffer),
    );
    archivePath = uploaded.path;
  }
  if (!archivePath) throw new Error("No world archive provided");

  const staging = `__guartrix_world_stage_${Date.now()}`;
  await daemonDecompressFile(server.id, archivePath, staging);

  async function findLevelDat(rel: string, depth: number): Promise<string | null> {
    if (depth > 4) return null;
    const listed = (await daemonListFiles(server.id, rel)) as {
      entries?: Array<{ name: string; type: "file" | "dir" }>;
    };
    const entries = listed.entries ?? [];
    if (entries.some((e) => e.name === "level.dat" && e.type === "file")) {
      return rel;
    }
    for (const e of entries) {
      if (e.type !== "dir") continue;
      const found = await findLevelDat(rel ? `${rel}/${e.name}` : e.name, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const worldSrc = await findLevelDat(staging, 0);
  if (!worldSrc) {
    await daemonDeleteFile(server.id, staging).catch(() => undefined);
    await daemonDeleteFile(server.id, archivePath).catch(() => undefined);
    throw new Error("Archive does not contain a Minecraft world (level.dat not found)");
  }

  for (const p of worldPaths(levelName, ["overworld", "nether", "end"])) {
    await daemonDeleteFile(server.id, p).catch(() => undefined);
  }

  if (worldSrc === staging) {
    await daemonRename(server.id, staging, levelName);
  } else {
    await daemonRename(server.id, worldSrc, levelName);
    await daemonDeleteFile(server.id, staging).catch(() => undefined);
  }

  await daemonDeleteFile(server.id, archivePath).catch(() => undefined);
  return { levelName, path: levelName };
}

export async function applyCreateWorldDefaults(
  serverId: string,
  defaults: {
    seed?: string;
    gamemode?: string;
    difficulty?: string;
    levelType?: string;
    generatorSettings?: string;
  },
): Promise<void> {
  const updates: Record<string, string> = {};
  if (defaults.seed != null && defaults.seed !== "") updates["level-seed"] = defaults.seed;
  if (defaults.gamemode) updates["gamemode"] = defaults.gamemode;
  if (defaults.difficulty) updates["difficulty"] = defaults.difficulty;
  if (defaults.levelType) updates["level-type"] = defaults.levelType;
  if (defaults.generatorSettings) {
    updates["generator-settings"] = defaults.generatorSettings;
  }
  if (Object.keys(updates).length === 0) return;
  await updateServerProperties(serverId, updates);
}

export async function applyVersionChangeViaRuntime(
  serverId: string,
  targetMcVersion: string,
): Promise<{ server: Server; update: Awaited<ReturnType<typeof checkServerUpdate>> }> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  assertStopped(server);

  const versions = await listVersions(server.type as ServerType);
  const mcVersion = targetMcVersion.trim();
  if (!versions.includes(mcVersion)) {
    throw new Error(`Version ${mcVersion} is not available for ${server.type}`);
  }

  await prisma.server.update({
    where: { id: server.id },
    data: { status: "CREATING", errorMessage: null },
  });

  try {
    await createBackup({
      serverId: server.id,
      trigger: "manual",
      note: `Pre-update ${server.mcVersion} → ${mcVersion}`,
    });
    const prepared = await replaceRuntimeOnNode({
      serverId: server.id,
      nodeId: requireNodeId(server),
      type: server.type as ServerType,
      mcVersion,
    });
    const updated = await markMeta(server.id, prepared, { mcVersion });
    return { server: updated, update: await checkServerUpdate(updated) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "ERROR", errorMessage: `Update failed: ${message}` },
    });
    throw err;
  }
}
