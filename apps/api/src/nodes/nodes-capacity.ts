import type { DaemonNode } from "@guartrix/shared";
import { prisma } from "../db.js";
import { nodeAllocationBudget } from "./nodes-helpers.js";
import { serializeNode } from "./nodes-serialize.js";

/** Load all nodes with allocated RAM / disk / CPU. */
export async function listNodesWithUsage(): Promise<DaemonNode[]> {
  const nodes = await prisma.node.findMany({
    orderBy: [{ isLocal: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { servers: true } },
      servers: { select: { memoryMb: true, diskMb: true, cpuLimit: true } },
    },
  });
  return nodes.map((n) => {
    const memoryUsed = n.servers.reduce((sum, s) => sum + s.memoryMb, 0);
    const diskUsed = n.servers.reduce((sum, s) => sum + (s.diskMb ?? 0), 0);
    const cpuUsed = n.servers.reduce((sum, s) => sum + (s.cpuLimit ?? 0), 0);
    return serializeNode(n, n._count.servers, memoryUsed, diskUsed, cpuUsed);
  });
}

/** Ensure node exists and has enough free allocation budget. */
export async function assertNodeCapacity(
  nodeId: string,
  memoryMb: number,
  opts?: {
    excludeServerId?: string;
    diskMb?: number;
    cpuLimit?: number;
    /** When set, disk budget is checked against this storage pool instead of the node. */
    storageId?: string | null;
    /** Enforce deployable + not under maintenance (create / transfer). */
    placement?: boolean;
  },
): Promise<void> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      servers: {
        select: { id: true, memoryMb: true, diskMb: true, cpuLimit: true, storageId: true },
      },
    },
  });
  if (!node) throw new Error("Node not found");
  if (opts?.placement) {
    if (node.maintenanceMode) {
      throw new Error(`Node "${node.name}" is under maintenance — cannot place servers there`);
    }
    if (node.deployable === false) {
      throw new Error(`Node "${node.name}" is not enabled for deployments`);
    }
  }

  const others = node.servers.filter((s) => s.id !== opts?.excludeServerId);

  if (node.memoryMb > 0) {
    const budget = nodeAllocationBudget(node.memoryMb, node.memoryOverallocate ?? 0);
    const used = others.reduce((sum, s) => sum + s.memoryMb, 0);
    const available = budget - used;
    if (memoryMb > available) {
      const needGb = (memoryMb / 1024).toFixed(memoryMb % 1024 === 0 ? 0 : 1);
      const freeGb = (Math.max(0, available) / 1024).toFixed(available % 1024 === 0 ? 0 : 1);
      throw new Error(
        `Not enough RAM on node "${node.name}": need ${needGb} GB, available ${freeGb} GB`,
      );
    }
  }

  const wantDisk = opts?.diskMb;
  if (wantDisk !== undefined) {
    const storageId = opts?.storageId ?? null;
    if (storageId) {
      const storage = await prisma.nodeStorage.findFirst({
        where: { id: storageId, nodeId },
      });
      if (!storage) throw new Error("Storage not found on this node");
      if (!storage.enabled) throw new Error(`Storage "${storage.name}" is disabled`);
      if (storage.diskMb > 0) {
        const poolOthers = others.filter((s) => s.storageId === storageId);
        const used = poolOthers.reduce((sum, s) => sum + (s.diskMb ?? 0), 0);
        const available = storage.diskMb - used;
        if (wantDisk > available) {
          throw new Error(
            `Not enough disk on storage "${storage.name}": need ${wantDisk} MiB, available ${Math.max(0, available)} MiB`,
          );
        }
      }
    } else if ((node.diskMb ?? 0) > 0) {
      const budget = nodeAllocationBudget(node.diskMb, node.diskOverallocate ?? 0);
      const used = others
        .filter((s) => !s.storageId)
        .reduce((sum, s) => sum + (s.diskMb ?? 0), 0);
      const available = budget - used;
      if (wantDisk > available) {
        throw new Error(
          `Not enough disk on node "${node.name}": need ${wantDisk} MiB, available ${Math.max(0, available)} MiB`,
        );
      }
    }
  }

  const wantCpu = opts?.cpuLimit;
  if (wantCpu !== undefined && (node.cpuLimit ?? 0) > 0) {
    const budget = nodeAllocationBudget(node.cpuLimit, node.cpuOverallocate ?? 0);
    const used = others.reduce((sum, s) => sum + (s.cpuLimit ?? 0), 0);
    const available = budget - used;
    if (wantCpu > available) {
      throw new Error(
        `Not enough CPU on node "${node.name}": need ${wantCpu}%, available ${Math.max(0, available)}%`,
      );
    }
  }
}
