import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "@prisma/client";
import { ALL_SERVER_TYPES, type ServerType } from "@guartrix/shared";
import { createBackup } from "../backups.js";
import { daemonExportArchiveToFile, daemonWriteFile } from "../../nodes/daemon-client.js";
import { prisma } from "../../db.js";
import { listVersions } from "../../providers/jars.js";
import { replaceRuntimeOnNode } from "../server-files.js";

import {
  assertStopped,
  markMeta,
  requireNodeId,
  wipeAndPrepare,
  wipeAddonDir,
  changeTypeRequiresWipeAddons,
  addonRelDir,
} from "./helpers.js";

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

  const requiresWipe = changeTypeRequiresWipeAddons(server.type as ServerType, opts.type);
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
