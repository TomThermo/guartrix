import path from "node:path";
import { serverDir } from "../config.js";
import { prisma } from "../db.js";

/**
 * Absolute host path for a server's files when the panel can write them directly.
 * Local node + storage pool → `{mountPoint}/servers/<id>`; otherwise panel `DATA_DIR/servers/<id>`.
 * Remote nodes still stage under panel `serverDir` and deploy via the daemon.
 */
export async function resolveLocalServerDataDir(serverId: string): Promise<string> {
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      storageId: true,
      storage: { select: { mountPoint: true } },
      node: { select: { isLocal: true } },
    },
  });
  if (row?.node?.isLocal && row.storageId && row.storage?.mountPoint) {
    return path.join(path.resolve(row.storage.mountPoint), "servers", serverId);
  }
  return serverDir(serverId);
}

/** True when files must be pushed through the daemon (remote node or local storage pool). */
export async function mustDeployViaDaemon(serverId: string, isLocalNode: boolean): Promise<boolean> {
  if (!isLocalNode) return true;
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: { storageId: true },
  });
  return Boolean(row?.storageId);
}
