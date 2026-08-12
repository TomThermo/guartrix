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

export type PrepareProgress = (message: string) => Promise<void>;

/**
 * Prepare Minecraft server files on the correct node.
 * Local node (default DATA_DIR or storage pool mount) writes in place; remote nodes get a tar deploy.
 */
export async function prepareServerOnNode(opts: {
  serverId: string;
  nodeId: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  paperBuild?: number;
  onProgress?: PrepareProgress;
}): Promise<{
  jarName: string;
  paperBuild?: number;
  fabricLoaderVersion?: string;
  forgeVersion?: string;
}> {
  const node = await prisma.node.findUnique({ where: { id: opts.nodeId } });
  if (!node) throw new Error("Node not found");

  const prepareOpts = opts.paperBuild != null ? { paperBuild: opts.paperBuild } : undefined;

  if (!mustDeployViaDaemon(node.isLocal)) {
    await opts.onProgress?.("Creating: downloading server files…");
    const dest = await resolveLocalServerDataDir(opts.serverId);
    await fs.mkdir(dest, { recursive: true });
    const prepared = await prepareServerFiles(
      opts.type,
      opts.mcVersion,
      dest,
      opts.port,
      prepareOpts,
    );
    await fixDataOwnership(opts.serverId);
    return prepared;
  }

  await opts.onProgress?.("Creating: downloading server files…");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-prepare-${opts.serverId}-`));
  try {
    const prepared = await prepareServerFiles(
      opts.type,
      opts.mcVersion,
      tmp,
      opts.port,
      prepareOpts,
    );
    await opts.onProgress?.("Creating: deploying files to node…");
    await daemonDeployFromDir(opts.serverId, tmp);
    return prepared;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Replace jar / loader runtime on the owning node without wiping world data.
 * Remote: build in tmp + merge-deploy (extract over existing files).
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

  if (!mustDeployViaDaemon(node.isLocal)) {
    const dest = await resolveLocalServerDataDir(opts.serverId);
    await fs.mkdir(dest, { recursive: true });
    const prepared = await replaceServerRuntime(opts.type, opts.mcVersion, dest);
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

  if (!mustDeployViaDaemon(node.isLocal)) {
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
  try {
    const alt = await resolveLocalServerDataDir(serverId);
    if (path.resolve(alt) !== path.resolve(serverDir(serverId))) {
      await fs.rm(alt, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    /* server row may already be gone */
  }
}
