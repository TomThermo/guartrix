import path from "node:path";
import { serverDir } from "../config.js";
import { prisma } from "../db.js";
import { resolveStorageMountPoint } from "../services/storage-pools.js";

/**
 * Absolute host path for a server's files when the panel can write them directly.
 * Local node + storage pool → `{link.mountPoint}/servers/<id>`; otherwise panel `DATA_DIR/servers/<id>`.
 * Remote nodes still stage under panel `serverDir` and deploy via the daemon.
 */
export async function resolveLocalServerDataDir(serverId: string): Promise<string> {
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      storageId: true,
      nodeId: true,
      node: { select: { isLocal: true } },
    },
  });
  if (row?.node?.isLocal && row.storageId && row.nodeId) {
    const mountPoint = await resolveStorageMountPoint(row.storageId, row.nodeId);
    if (mountPoint) {
      return path.join(path.resolve(mountPoint), "servers", serverId);
    }
  }
  return serverDir(serverId);
}

/** Remote nodes need a tar deploy; local nodes (incl. storage pools) write the mount path in place. */
export function mustDeployViaDaemon(isLocalNode: boolean): boolean {
  return !isLocalNode;
}
