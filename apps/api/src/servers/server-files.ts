import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerType } from "@guartrix/shared";
import { daemonDeployFromDir, daemonWipeServer } from "../nodes/daemon-client.js";
import { serverDir } from "../config.js";
import { prisma } from "../db.js";
import { fixDataOwnership } from "./process-manager.js";
import { prepareServerFiles, replaceServerRuntime } from "../providers/jars.js";
import { mustDeployViaDaemon, resolveLocalServerDataDir } from "./server-data-path.js";

/**
 * Prepare Minecraft server files on the correct node.
 * Default local DATA_DIR is written in place; remote nodes and local storage pools
 * get a tar deploy so files land under the daemon's resolved server directory.
 */
export async function prepareServerOnNode(opts: {
  serverId: string;
  nodeId: string;
  type: ServerType;
  mcVersion: string;
  port: number;
}): Promise<{
  jarName: string;
  paperBuild?: number;
  fabricLoaderVersion?: string;
  forgeVersion?: string;
}> {
  const node = await prisma.node.findUnique({ where: { id: opts.nodeId } });
  if (!node) throw new Error("Node not found");

  const viaDaemon = await mustDeployViaDaemon(opts.serverId, node.isLocal);
  if (!viaDaemon) {
    const prepared = await prepareServerFiles(
      opts.type,
      opts.mcVersion,
      serverDir(opts.serverId),
      opts.port,
    );
    await fixDataOwnership(opts.serverId);
    return prepared;
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-prepare-${opts.serverId}-`));
  try {
    const prepared = await prepareServerFiles(opts.type, opts.mcVersion, tmp, opts.port);
    await daemonDeployFromDir(opts.serverId, tmp);
    return prepared;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Replace jar / loader runtime on the owning node without wiping world data.
 * Remote / storage-pool: build in tmp + merge-deploy (extract over existing files).
 */
export async function replaceRuntimeOnNode(opts: {
  serverId: string;
  nodeId: string;
  type: ServerType;
  mcVersion: string;
}): Promise<{
  jarName: string;
  paperBuild?: number;
  fabricLoaderVersion?: string;
  forgeVersion?: string;
}> {
  const node = await prisma.node.findUnique({ where: { id: opts.nodeId } });
  if (!node) throw new Error("Node not found");

  const viaDaemon = await mustDeployViaDaemon(opts.serverId, node.isLocal);
  if (!viaDaemon) {
    const prepared = await replaceServerRuntime(
      opts.type,
      opts.mcVersion,
      serverDir(opts.serverId),
    );
    await fixDataOwnership(opts.serverId);
    return prepared;
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-runtime-${opts.serverId}-`));
  try {
    const prepared = await replaceServerRuntime(opts.type, opts.mcVersion, tmp);
    await daemonDeployFromDir(opts.serverId, tmp);
    return prepared;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Place an already-populated local directory onto the target node.
 * Used by import/clone after extracting or copying files locally.
 */
export async function syncLocalDirToNode(
  serverId: string,
  nodeId: string,
  localDir: string,
): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) throw new Error("Node not found");

  const viaDaemon = await mustDeployViaDaemon(serverId, node.isLocal);
  if (!viaDaemon) {
    const dest = serverDir(serverId);
    if (path.resolve(localDir) !== path.resolve(dest)) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(localDir, dest, { recursive: true });
    }
    await fixDataOwnership(serverId);
    return;
  }

  // Local storage pool: prefer copying onto the mount when the panel can see it
  // (avoids re-tarring large worlds). Fall back to daemon deploy.
  if (node.isLocal) {
    const dest = await resolveLocalServerDataDir(serverId);
    if (path.resolve(localDir) !== path.resolve(dest)) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(localDir, dest, { recursive: true });
    }
    await fixDataOwnership(serverId);
    return;
  }

  await daemonDeployFromDir(serverId, localDir);
}

/** Wipe server files + container on the owning daemon (and local leftovers). */
export async function wipeServerEverywhere(serverId: string): Promise<void> {
  await daemonWipeServer(serverId).catch(() => undefined);
  await fs.rm(serverDir(serverId), { recursive: true, force: true }).catch(() => undefined);
  // Storage-pool path on a local node (panel DATA_DIR may not hold the files).
  try {
    const alt = await resolveLocalServerDataDir(serverId);
    if (path.resolve(alt) !== path.resolve(serverDir(serverId))) {
      await fs.rm(alt, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    /* server row may already be gone */
  }
}
