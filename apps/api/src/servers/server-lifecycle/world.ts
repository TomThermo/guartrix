import { Readable } from "node:stream";
import { createBackup } from "../backups.js";
import {
  daemonDeleteFile,
  daemonDecompressFile,
  daemonListFiles,
  daemonRename,
} from "../../nodes/daemon-client.js";
import { prisma } from "../../db.js";
import { saveUpload } from "../files.js";
import { readServerProperties } from "../properties.js";

import { assertStopped, worldPaths, type WorldDimension } from "./helpers.js";

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
  const dimensions: WorldDimension[] = opts.dimensions?.length
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
    const name = (opts.fileName || "world-upload.zip").replace(/[^\w.-]+/g, "_");
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
