import path from "node:path";
import { nanoid } from "nanoid";
import type { StoragePoolType } from "@prisma/client";
import { prisma } from "../db.js";
import {
  daemonSetServerLocation,
  daemonStorageMount,
  daemonStorageStatus,
  daemonStorageUnmount,
  type DaemonStoragePathStatus,
} from "../nodes/daemon-client.js";

const DEFAULT_NFS_OPTS = "vers=4.1,hard,timeo=600,_netdev";

function assertAbsolutePath(p: string, label: string): string {
  const resolved = path.posix.normalize(p.trim());
  if (!resolved.startsWith("/") || resolved.includes("\0") || resolved === "/") {
    throw new Error(`${label} must be an absolute path`);
  }
  if (resolved.split("/").includes("..")) {
    throw new Error(`${label} must not contain '..'`);
  }
  return resolved;
}

export type StorageNodeLinkView = {
  id: string;
  storageId: string;
  nodeId: string;
  nodeName: string;
  mountPoint: string;
  hostPath: string | null;
  createdAt: string;
  updatedAt: string;
  status: DaemonStoragePathStatus | null;
  /** Servers on this node assigned to the pool. */
  serverCount: number;
};

export type StoragePoolView = {
  id: string;
  name: string;
  type: StoragePoolType;
  nfsServer: string | null;
  nfsExport: string | null;
  nfsOptions: string | null;
  diskMb: number;
  enabled: boolean;
  serverCount: number;
  createdAt: string;
  updatedAt: string;
  links: StorageNodeLinkView[];
};

function toLinkView(
  link: {
    id: string;
    storageId: string;
    nodeId: string;
    mountPoint: string;
    hostPath: string | null;
    createdAt: Date;
    updatedAt: Date;
    node: { name: string };
  },
  status: DaemonStoragePathStatus | null,
  serverCount: number,
): StorageNodeLinkView {
  return {
    id: link.id,
    storageId: link.storageId,
    nodeId: link.nodeId,
    nodeName: link.node.name,
    mountPoint: link.mountPoint,
    hostPath: link.hostPath,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    status,
    serverCount,
  };
}

async function loadPoolOrThrow(storageId: string) {
  const pool = await prisma.storagePool.findUnique({
    where: { id: storageId },
    include: {
      links: { include: { node: { select: { id: true, name: true, daemonBaseDirectory: true } } } },
      _count: { select: { servers: true } },
    },
  });
  if (!pool) throw Object.assign(new Error("Storage not found"), { status: 404 });
  return pool;
}

async function statusesForLinks(
  links: { nodeId: string; mountPoint: string }[],
): Promise<Map<string, DaemonStoragePathStatus>> {
  const byKey = new Map<string, DaemonStoragePathStatus>();
  const byNode = new Map<string, string[]>();
  for (const link of links) {
    const list = byNode.get(link.nodeId) ?? [];
    list.push(link.mountPoint);
    byNode.set(link.nodeId, list);
  }
  await Promise.all(
    [...byNode.entries()].map(async ([nodeId, paths]) => {
      try {
        const { statuses } = await daemonStorageStatus(nodeId, paths);
        for (const st of statuses) {
          byKey.set(`${nodeId}:${path.resolve(st.path)}`, st);
          byKey.set(`${nodeId}:${st.path}`, st);
        }
      } catch {
        /* node offline */
      }
    }),
  );
  return byKey;
}

function pickStatus(
  map: Map<string, DaemonStoragePathStatus>,
  nodeId: string,
  mountPoint: string,
): DaemonStoragePathStatus | null {
  return (
    map.get(`${nodeId}:${mountPoint}`) ??
    map.get(`${nodeId}:${path.resolve(mountPoint)}`) ??
    null
  );
}

async function toPoolView(
  pool: Awaited<ReturnType<typeof loadPoolOrThrow>>,
  withStatus: boolean,
): Promise<StoragePoolView> {
  const serverCounts = await prisma.server.groupBy({
    by: ["nodeId"],
    where: { storageId: pool.id },
    _count: { _all: true },
  });
  const countByNode = new Map(serverCounts.map((r) => [r.nodeId, r._count._all]));

  let statusMap = new Map<string, DaemonStoragePathStatus>();
  if (withStatus && pool.links.length) {
    statusMap = await statusesForLinks(pool.links);
  }

  return {
    id: pool.id,
    name: pool.name,
    type: pool.type,
    nfsServer: pool.nfsServer,
    nfsExport: pool.nfsExport,
    nfsOptions: pool.nfsOptions,
    diskMb: pool.diskMb,
    enabled: pool.enabled,
    serverCount: pool._count.servers,
    createdAt: pool.createdAt.toISOString(),
    updatedAt: pool.updatedAt.toISOString(),
    links: pool.links.map((link) =>
      toLinkView(
        {
          id: link.id,
          storageId: link.storageId,
          nodeId: link.nodeId,
          mountPoint: link.mountPoint,
          hostPath: link.hostPath,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
          node: link.node,
        },
        pickStatus(statusMap, link.nodeId, link.mountPoint),
        countByNode.get(link.nodeId) ?? 0,
      ),
    ),
  };
}

export type CreateStoragePoolInput = {
  name: string;
  type: StoragePoolType;
  nfsServer?: string | null;
  nfsExport?: string | null;
  nfsOptions?: string | null;
  diskMb?: number;
  enabled?: boolean;
  /** Optional first node to link on create. */
  nodeId?: string;
  mountPoint?: string;
  hostPath?: string | null;
};

export type UpdateStoragePoolInput = Partial<
  Omit<CreateStoragePoolInput, "type" | "nodeId" | "mountPoint" | "hostPath">
> & { type?: StoragePoolType };

export type LinkStorageNodeInput = {
  nodeId: string;
  mountPoint?: string;
  hostPath?: string | null;
};

export async function listStoragePools(): Promise<StoragePoolView[]> {
  const rows = await prisma.storagePool.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      links: { include: { node: { select: { id: true, name: true, daemonBaseDirectory: true } } } },
      _count: { select: { servers: true } },
    },
  });
  const out: StoragePoolView[] = [];
  for (const row of rows) {
    out.push(await toPoolView(row, true));
  }
  return out;
}

export async function getStoragePool(storageId: string): Promise<StoragePoolView> {
  const pool = await loadPoolOrThrow(storageId);
  return toPoolView(pool, true);
}

/** Pools linked to a node (for create-server picker). */
export async function listStoragePoolsForNode(nodeId: string): Promise<StoragePoolView[]> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) throw Object.assign(new Error("Node not found"), { status: 404 });

  const rows = await prisma.storagePool.findMany({
    where: { links: { some: { nodeId } }, enabled: true },
    orderBy: { name: "asc" },
    include: {
      links: {
        where: { nodeId },
        include: { node: { select: { id: true, name: true, daemonBaseDirectory: true } } },
      },
      _count: { select: { servers: true } },
    },
  });
  const out: StoragePoolView[] = [];
  for (const row of rows) {
    out.push(await toPoolView(row, true));
  }
  return out;
}

export async function createStoragePool(input: CreateStoragePoolInput): Promise<StoragePoolView> {
  const name = input.name.trim();
  if (!name || name.length > 64) throw new Error("Name is required (max 64 chars)");

  const id = nanoid(12);
  let nfsServer: string | null = null;
  let nfsExport: string | null = null;
  let nfsOptions: string | null = null;

  if (input.type === "NFS") {
    nfsServer = (input.nfsServer ?? "").trim();
    nfsExport = (input.nfsExport ?? "").trim();
    if (!nfsServer || !nfsExport) throw new Error("NFS server and export are required");
    nfsExport = assertAbsolutePath(nfsExport, "NFS export");
    nfsOptions = (input.nfsOptions ?? DEFAULT_NFS_OPTS).trim() || DEFAULT_NFS_OPTS;
  }

  const diskMb = Math.max(0, Math.min(10_485_760, Number(input.diskMb) || 0));

  await prisma.storagePool.create({
    data: {
      id,
      name,
      type: input.type,
      nfsServer,
      nfsExport,
      nfsOptions,
      diskMb,
      enabled: input.enabled !== false,
    },
  });

  if (input.nodeId) {
    await linkStorageNode(id, {
      nodeId: input.nodeId,
      mountPoint: input.mountPoint,
      hostPath: input.hostPath,
    });
  }

  return getStoragePool(id);
}

export async function updateStoragePool(
  storageId: string,
  input: UpdateStoragePoolInput,
): Promise<StoragePoolView> {
  const existing = await loadPoolOrThrow(storageId);

  if (input.type !== undefined && input.type !== existing.type) {
    throw new Error("Cannot change storage type after create");
  }

  const data: {
    name?: string;
    nfsServer?: string | null;
    nfsExport?: string | null;
    nfsOptions?: string | null;
    diskMb?: number;
    enabled?: boolean;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 64) throw new Error("Name is required (max 64 chars)");
    data.name = name;
  }
  if (input.nfsServer !== undefined) data.nfsServer = input.nfsServer?.trim() || null;
  if (input.nfsExport !== undefined) {
    data.nfsExport = input.nfsExport ? assertAbsolutePath(input.nfsExport, "NFS export") : null;
  }
  if (input.nfsOptions !== undefined) data.nfsOptions = input.nfsOptions?.trim() || null;
  if (input.diskMb !== undefined) {
    data.diskMb = Math.max(0, Math.min(10_485_760, Number(input.diskMb) || 0));
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;

  if (existing.type === "NFS") {
    const nextServer = data.nfsServer !== undefined ? data.nfsServer : existing.nfsServer;
    const nextExport = data.nfsExport !== undefined ? data.nfsExport : existing.nfsExport;
    if (!nextServer || !nextExport) throw new Error("NFS server and export are required");
  }

  await prisma.storagePool.update({ where: { id: storageId }, data });
  return getStoragePool(storageId);
}

export async function deleteStoragePool(storageId: string, opts?: { force?: boolean }): Promise<void> {
  const existing = await loadPoolOrThrow(storageId);
  if (existing._count.servers > 0 && !opts?.force) {
    throw new Error("Cannot delete storage while servers are assigned to it");
  }
  if (opts?.force && existing._count.servers > 0) {
    await prisma.server.updateMany({ where: { storageId }, data: { storageId: null } });
  }
  await prisma.storagePool.delete({ where: { id: storageId } });
}

export async function linkStorageNode(
  storageId: string,
  input: LinkStorageNodeInput,
): Promise<StoragePoolView> {
  const pool = await loadPoolOrThrow(storageId);
  const node = await prisma.node.findUnique({ where: { id: input.nodeId } });
  if (!node) throw Object.assign(new Error("Node not found"), { status: 404 });

  const existing = pool.links.find((l) => l.nodeId === input.nodeId);
  if (existing) throw new Error("Node is already linked to this storage");

  const baseDir = node.daemonBaseDirectory?.trim() || "/var/lib/guartrix";
  let mountPoint = input.mountPoint?.trim()
    ? assertAbsolutePath(input.mountPoint, "Mount point")
    : path.posix.join(baseDir, "mounts", storageId);

  let hostPath: string | null = null;
  if (pool.type === "LOCAL") {
    hostPath = assertAbsolutePath(input.hostPath?.trim() || mountPoint, "Host path");
    if (!input.mountPoint?.trim()) {
      mountPoint = hostPath;
    }
  }

  await prisma.storageNodeLink.create({
    data: {
      id: nanoid(12),
      storageId,
      nodeId: input.nodeId,
      mountPoint,
      hostPath,
    },
  });

  return getStoragePool(storageId);
}

export async function unlinkStorageNode(storageId: string, nodeId: string): Promise<StoragePoolView> {
  const pool = await loadPoolOrThrow(storageId);
  const link = pool.links.find((l) => l.nodeId === nodeId);
  if (!link) throw Object.assign(new Error("Node is not linked to this storage"), { status: 404 });

  const serverCount = await prisma.server.count({ where: { storageId, nodeId } });
  if (serverCount > 0) {
    throw new Error("Cannot unlink node while servers on that node use this storage");
  }

  await prisma.storageNodeLink.delete({ where: { id: link.id } });
  return getStoragePool(storageId);
}

export async function updateStorageNodeLink(
  storageId: string,
  nodeId: string,
  input: { mountPoint?: string; hostPath?: string | null },
): Promise<StoragePoolView> {
  const pool = await loadPoolOrThrow(storageId);
  const link = pool.links.find((l) => l.nodeId === nodeId);
  if (!link) throw Object.assign(new Error("Node is not linked to this storage"), { status: 404 });

  const data: { mountPoint?: string; hostPath?: string | null } = {};
  if (input.mountPoint !== undefined) {
    data.mountPoint = assertAbsolutePath(input.mountPoint, "Mount point");
  }
  if (input.hostPath !== undefined) {
    data.hostPath = input.hostPath ? assertAbsolutePath(input.hostPath, "Host path") : null;
  }

  await prisma.storageNodeLink.update({ where: { id: link.id }, data });
  return getStoragePool(storageId);
}

export async function mountStorageOnNode(
  storageId: string,
  nodeId: string,
): Promise<StoragePoolView> {
  const pool = await loadPoolOrThrow(storageId);
  if (!pool.enabled) throw new Error("Storage is disabled");
  const link = pool.links.find((l) => l.nodeId === nodeId);
  if (!link) throw new Error("Node is not linked to this storage");

  await daemonStorageMount(nodeId, {
    type: pool.type === "NFS" ? "nfs" : "local",
    mountPoint: link.mountPoint,
    hostPath: link.hostPath,
    nfsServer: pool.nfsServer,
    nfsExport: pool.nfsExport,
    nfsOptions: pool.nfsOptions,
  });
  return getStoragePool(storageId);
}

export async function unmountStorageOnNode(
  storageId: string,
  nodeId: string,
  opts?: { force?: boolean; lazy?: boolean },
): Promise<StoragePoolView> {
  const pool = await loadPoolOrThrow(storageId);
  const link = pool.links.find((l) => l.nodeId === nodeId);
  if (!link) throw new Error("Node is not linked to this storage");

  await daemonStorageUnmount(nodeId, {
    mountPoint: link.mountPoint,
    force: opts?.force,
    lazy: opts?.lazy,
  });
  return getStoragePool(storageId);
}

/** Validate pool is enabled and linked to node; return that node's mount point. */
export async function assertServerStorageAssignable(
  nodeId: string,
  storageId: string | null | undefined,
): Promise<{ mountPoint: string | null }> {
  if (!storageId) return { mountPoint: null };
  const pool = await prisma.storagePool.findUnique({
    where: { id: storageId },
    include: { links: { where: { nodeId } } },
  });
  if (!pool) throw new Error("Storage not found");
  if (!pool.enabled) throw new Error("Storage is disabled");
  const link = pool.links[0];
  if (!link) throw new Error("Storage is not linked to this node");
  return { mountPoint: link.mountPoint };
}

export async function syncServerStorageLocation(
  nodeId: string,
  serverId: string,
  storageId: string | null | undefined,
): Promise<void> {
  const { mountPoint } = await assertServerStorageAssignable(nodeId, storageId);
  try {
    await daemonSetServerLocation(nodeId, serverId, mountPoint);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to set server data location on node: ${message}`);
  }
}

/** Resolve mount point for a server on its node (local path writes). */
export async function resolveStorageMountPoint(
  storageId: string,
  nodeId: string,
): Promise<string | null> {
  const link = await prisma.storageNodeLink.findUnique({
    where: { storageId_nodeId: { storageId, nodeId } },
  });
  return link?.mountPoint ?? null;
}
