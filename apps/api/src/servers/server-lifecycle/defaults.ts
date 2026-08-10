import type { Server } from "@prisma/client";
import type { ServerType } from "@guartrix/shared";
import { createBackup } from "../backups.js";
import { prisma } from "../../db.js";
import { listVersions } from "../../providers/jars.js";
import { updateServerProperties } from "../properties.js";
import { replaceRuntimeOnNode } from "../server-files.js";
import { checkServerUpdate } from "../updates.js";

import { assertStopped, markMeta, requireNodeId } from "./helpers.js";

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
  if (defaults.gamemode) updates.gamemode = defaults.gamemode;
  if (defaults.difficulty) updates.difficulty = defaults.difficulty;
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
