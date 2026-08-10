import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "@prisma/client";
import { addonKindFor, type ServerType } from "@guartrix/shared";
import { daemonDeleteFile } from "../../nodes/daemon-client.js";
import { prisma } from "../../db.js";
import { processManager } from "../process-manager.js";
import { prepareServerOnNode, syncLocalDirToNode, wipeServerEverywhere } from "../server-files.js";

export type WorldDimension = "overworld" | "nether" | "end";

export function assertStopped(server: Server): void {
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

export function requireNodeId(server: Server): string {
  if (!server.nodeId) throw new Error("Server has no node assigned");
  return server.nodeId;
}

export function addonRelDir(type: ServerType): string | null {
  const kind = addonKindFor(type);
  if (kind === "plugin") return "plugins";
  if (kind === "mod") return "mods";
  return null;
}

/** Cross-ecosystem switches require wiping plugins/mods. */
export function changeTypeRequiresWipeAddons(from: ServerType, to: ServerType): boolean {
  const a = addonKindFor(from);
  const b = addonKindFor(to);
  if (!a || !b) return a !== b;
  return a !== b;
}

export async function wipeAddonDir(serverId: string, type: ServerType): Promise<void> {
  const rel = addonRelDir(type);
  if (!rel) return;
  await daemonDeleteFile(serverId, rel).catch(() => undefined);
  await daemonDeleteFile(serverId, "guartrix-addons.json").catch(() => undefined);
}

export function worldPaths(levelName: string, dimensions: WorldDimension[]): string[] {
  const paths: string[] = [];
  for (const d of dimensions) {
    if (d === "overworld") paths.push(levelName);
    else if (d === "nether") paths.push(`${levelName}_nether`);
    else if (d === "end") paths.push(`${levelName}_the_end`);
  }
  return paths;
}

export async function markMeta(
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
export async function wipeAndPrepare(
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
      const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-extract-${server.id}-`));
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        await promisify(execFile)("tar", ["-xzf", restoreAddonsFromExport, "-C", extractDir], {
          maxBuffer: 64 * 1024 * 1024,
        });
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
