import type { ServerType } from "@msm/shared";
import { installAddon } from "./addons.js";
import { ensureUdpCompanion } from "./allocations.js";
import { createBackup } from "./backups.js";
import { serverDir } from "../config.js";
import { prisma } from "../db.js";
import { processManager } from "./process-manager.js";

/** Well-known Modrinth project IDs / slugs. */
const GEYSER_PROJECT = "geyser";
const FLOODGATE_PROJECT = "floodgate";

export async function installGeyserBundle(opts: {
  serverId: string;
  withFloodgate?: boolean;
}): Promise<{
  installed: string[];
  udpPort: number;
  hint: string;
}> {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: opts.serverId },
  });
  if (server.type !== "PAPER" && server.type !== "PURPUR") {
    throw new Error("Geyser one-click is available for Paper and Purpur only");
  }
  if (
    processManager.isRunning(server.id) ||
    server.status === "RUNNING" ||
    server.status === "STARTING"
  ) {
    throw new Error("Stop the server before installing Geyser");
  }
  if (!server.nodeId) throw new Error("Server has no node");

  await createBackup({
    serverId: server.id,
    trigger: "manual",
    note: "Pre-Geyser install",
  });

  const installed: string[] = [];
  const geyser = await installAddon({
    serverDir: serverDir(server.id),
    type: server.type as ServerType,
    mcVersion: server.mcVersion,
    projectId: GEYSER_PROJECT,
  });
  installed.push(geyser.installed.title);

  if (opts.withFloodgate !== false) {
    try {
      const floodgate = await installAddon({
        serverDir: serverDir(server.id),
        type: server.type as ServerType,
        mcVersion: server.mcVersion,
        projectId: FLOODGATE_PROJECT,
      });
      installed.push(floodgate.installed.title);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[guartrix] Floodgate install skipped: ${msg}`);
    }
  }

  await ensureUdpCompanion({
    serverId: server.id,
    nodeId: server.nodeId,
    port: server.port,
    notes: "Geyser Bedrock (UDP)",
  });

  return {
    installed,
    udpPort: server.port,
    hint: `Bedrock players join on the same host with UDP port ${server.port}. Restart the server after install. Floodgate enables Bedrock accounts without a Java Microsoft account.`,
  };
}
