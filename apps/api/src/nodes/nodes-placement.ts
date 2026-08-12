import { prisma } from "../db.js";
import { nodeAllocationBudget } from "./nodes-helpers.js";

export type CreatePlacementInput = {
  requestedNodeId?: string | null;
  requestedStorageId?: string | null;
  memoryMb: number;
  diskMb?: number;
  cpuLimit?: number;
};

export type CreatePlacementResult = {
  nodeId: string;
  /** null = node default DATA_DIR */
  storageId: string | null;
};

type NodeRow = Awaited<ReturnType<typeof loadPlacementNodes>>[number];

type StorageCandidate = {
  storageId: string | null;
  freeDiskMb: number;
};

function availableMemoryMb(node: NodeRow, excludeServerId?: string): number {
  if (node.memoryMb <= 0) return Number.MAX_SAFE_INTEGER;
  const budget = nodeAllocationBudget(node.memoryMb, node.memoryOverallocate ?? 0);
  const used = node.servers
    .filter((s) => s.id !== excludeServerId)
    .reduce((sum, s) => sum + s.memoryMb, 0);
  return Math.max(0, budget - used);
}

function availableCpu(node: NodeRow, excludeServerId?: string): number {
  if ((node.cpuLimit ?? 0) <= 0) return Number.MAX_SAFE_INTEGER;
  const budget = nodeAllocationBudget(node.cpuLimit ?? 0, node.cpuOverallocate ?? 0);
  const used = node.servers
    .filter((s) => s.id !== excludeServerId)
    .reduce((sum, s) => sum + (s.cpuLimit ?? 0), 0);
  return Math.max(0, budget - used);
}

function nodeDataDirFreeMb(node: NodeRow, excludeServerId?: string): number {
  if ((node.diskMb ?? 0) <= 0) return Number.MAX_SAFE_INTEGER;
  const budget = nodeAllocationBudget(node.diskMb ?? 0, node.diskOverallocate ?? 0);
  const used = node.servers
    .filter((s) => s.id !== excludeServerId && !s.storageId)
    .reduce((sum, s) => sum + (s.diskMb ?? 0), 0);
  return Math.max(0, budget - used);
}

async function loadPlacementNodes(nodeIds?: string[]) {
  const baseWhere = {
    ...(nodeIds?.length ? { id: { in: nodeIds } } : {}),
    deployable: true,
    maintenanceMode: false,
  };
  const online = await prisma.node.findMany({
    where: { ...baseWhere, status: "ONLINE" },
    include: {
      servers: {
        select: { id: true, memoryMb: true, diskMb: true, cpuLimit: true, storageId: true },
      },
    },
  });
  if (online.length) return online;
  return prisma.node.findMany({
    where: baseWhere,
    include: {
      servers: {
        select: { id: true, memoryMb: true, diskMb: true, cpuLimit: true, storageId: true },
      },
    },
  });
}

async function poolFreeMbOnNode(
  nodeId: string,
  storageId: string,
  servers: NodeRow["servers"],
  excludeServerId?: string,
): Promise<number> {
  const storage = await prisma.storagePool.findUnique({
    where: { id: storageId },
    include: { links: { where: { nodeId } } },
  });
  if (!storage || !storage.enabled || storage.links.length === 0) return -1;
  if (storage.diskMb <= 0) return Number.MAX_SAFE_INTEGER;
  const used = servers
    .filter((s) => s.id !== excludeServerId && s.storageId === storageId)
    .reduce((sum, s) => sum + (s.diskMb ?? 0), 0);
  return Math.max(0, storage.diskMb - used);
}

async function bestStorageOnNode(
  node: NodeRow,
  wantDiskMb?: number,
): Promise<StorageCandidate | null> {
  const candidates: StorageCandidate[] = [];

  const dataDirFree = nodeDataDirFreeMb(node);
  if (wantDiskMb === undefined || dataDirFree >= wantDiskMb) {
    candidates.push({ storageId: null, freeDiskMb: dataDirFree });
  }

  const pools = await prisma.storagePool.findMany({
    where: { enabled: true, links: { some: { nodeId: node.id } } },
    select: { id: true },
  });

  for (const pool of pools) {
    const free = await poolFreeMbOnNode(node.id, pool.id, node.servers);
    if (free < 0) continue;
    if (wantDiskMb !== undefined && free < wantDiskMb) continue;
    candidates.push({ storageId: pool.id, freeDiskMb: free });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.freeDiskMb - a.freeDiskMb);
  return candidates[0]!;
}

async function rankNode(
  node: NodeRow,
  input: CreatePlacementInput,
  fixedStorageId?: string | null,
): Promise<{ nodeId: string; storageId: string | null; mem: number; cpu: number; storageFree: number } | null> {
  const mem = availableMemoryMb(node);
  if (mem < input.memoryMb) return null;

  const wantCpu = input.cpuLimit ?? 0;
  const cpu = availableCpu(node);
  if (wantCpu > 0 && cpu < wantCpu) return null;

  let storageId: string | null;
  let storageFree: number;

  if (fixedStorageId !== undefined) {
    if (fixedStorageId === null) {
      storageFree = nodeDataDirFreeMb(node);
      if (input.diskMb !== undefined && storageFree < input.diskMb) return null;
      storageId = null;
    } else {
      storageFree = await poolFreeMbOnNode(node.id, fixedStorageId, node.servers);
      if (storageFree < 0) return null;
      if (input.diskMb !== undefined && storageFree < input.diskMb) return null;
      storageId = fixedStorageId;
    }
  } else {
    const best = await bestStorageOnNode(node, input.diskMb);
    if (!best) return null;
    storageId = best.storageId;
    storageFree = best.freeDiskMb;
  }

  return { nodeId: node.id, storageId, mem, cpu, storageFree };
}

function compareRank(
  a: { mem: number; cpu: number; storageFree: number },
  b: { mem: number; cpu: number; storageFree: number },
): number {
  if (b.mem !== a.mem) return b.mem - a.mem;
  if (b.cpu !== a.cpu) return b.cpu - a.cpu;
  return b.storageFree - a.storageFree;
}

/**
 * Pick node (+ optional storage pool) for create/import.
 * Priority when auto-placing: most free RAM → CPU → storage space.
 * Manual `storageId` / `nodeId` still override auto-pick when provided.
 */
export async function resolveCreatePlacement(
  input: CreatePlacementInput,
): Promise<CreatePlacementResult> {
  const requestedNodeId = input.requestedNodeId?.trim() || null;
  const requestedStorageId =
    input.requestedStorageId === null
      ? null
      : input.requestedStorageId?.trim()
        ? input.requestedStorageId.trim()
        : undefined;

  if (requestedNodeId) {
    const node = await prisma.node.findUnique({ where: { id: requestedNodeId } });
    if (!node) throw new Error("Node not found");
    if (node.maintenanceMode) {
      throw new Error(`Node "${node.name}" is under maintenance`);
    }
    if (!node.deployable) {
      throw new Error(`Node "${node.name}" is not enabled for deployments`);
    }

    if (requestedStorageId === undefined) {
      const full = await prisma.node.findUnique({
        where: { id: requestedNodeId },
        include: {
          servers: {
            select: { id: true, memoryMb: true, diskMb: true, cpuLimit: true, storageId: true },
          },
        },
      });
      if (!full) throw new Error("Node not found");
      const ranked = await rankNode(full, input);
      if (!ranked) {
        throw new Error(`Node "${node.name}" does not have enough resources for this server`);
      }
      return { nodeId: requestedNodeId, storageId: ranked.storageId };
    }

    if (requestedStorageId === null) {
      return { nodeId: requestedNodeId, storageId: null };
    }

    const link = await prisma.storageNodeLink.findUnique({
      where: { storageId_nodeId: { storageId: requestedStorageId, nodeId: requestedNodeId } },
    });
    if (!link) throw new Error("Storage is not linked to this node");
    return { nodeId: requestedNodeId, storageId: requestedStorageId };
  }

  let nodeIds: string[] | undefined;
  if (requestedStorageId) {
    const links = await prisma.storageNodeLink.findMany({
      where: { storageId: requestedStorageId },
      select: { nodeId: true },
    });
    nodeIds = links.map((l) => l.nodeId);
    if (!nodeIds.length) throw new Error("Storage is not linked to any node");
  }

  const nodes = await loadPlacementNodes(nodeIds);
  if (!nodes.length) {
    throw new Error(
      requestedStorageId
        ? "No deployable node is linked to this storage pool"
        : "No deployable nodes available",
    );
  }

  const ranked: Array<Awaited<ReturnType<typeof rankNode>> & object> = [];
  for (const node of nodes) {
    const row = await rankNode(
      node,
      input,
      requestedStorageId === undefined ? undefined : requestedStorageId,
    );
    if (row) ranked.push(row);
  }

  if (!ranked.length) {
    throw new Error("No node has enough RAM, CPU, and storage for this server");
  }

  ranked.sort(compareRank);
  const best = ranked[0]!;
  return { nodeId: best.nodeId, storageId: best.storageId };
}
