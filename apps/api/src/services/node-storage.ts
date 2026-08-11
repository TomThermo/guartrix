import path from "node:path";
import { nanoid } from "nanoid";
import type { NodeStorageType } from "@prisma/client";
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

export type NodeStorageView = {
  id: string;
  nodeId: string;
  name: string;
  type: NodeStorageType;
  mountPoint: string;
  hostPath: string | null;
  nfsServer: string | null;
  nfsExport: string | null;
  nfsOptions: string | null;
  diskMb: number;
  enabled: boolean;
  serverCount: number;
  createdAt: string;
  updatedAt: string;
  status: DaemonStoragePathStatus | null;
};

function toView(
  row: {
    id: string;
    nodeId: string;
    name: string;
    type: NodeStorageType;
    mountPoint: string;
    hostPath: string | null;
    nfsServer: string | null;
    nfsExport: string | null;
    nfsOptions: string | null;
    diskMb: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { servers: number };
  },
  status: DaemonStoragePathStatus | null,
): NodeStorageView {
  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.name,
    type: row.type,
    mountPoint: row.mountPoint,
    hostPath: row.hostPath,
    nfsServer: row.nfsServer,
    nfsExport: row.nfsExport,
    nfsOptions: row.nfsOptions,
    diskMb: row.diskMb,
    enabled: row.enabled,
    serverCount: row._count?.servers ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status,
  };
}

export type CreateNodeStorageInput = {
  name: string;
  type: NodeStorageType;
  mountPoint?: string;
  hostPath?: string | null;
  nfsServer?: string | null;
  nfsExport?: string | null;
  nfsOptions?: string | null;
  diskMb?: number;
  enabled?: boolean;
};

export type UpdateNodeStorageInput = Partial<CreateNodeStorageInput>;

export async function listNodeStorages(nodeId: string): Promise<NodeStorageView[]> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) throw Object.assign(new Error("Node not found"), { status: 404 });

  const rows = await prisma.nodeStorage.findMany({
    where: { nodeId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { servers: true } } },
  });

  let statusByPath = new Map<string, DaemonStoragePathStatus>();
  try {
    const { statuses } = await daemonStorageStatus(
      nodeId,
      rows.map((r) => r.mountPoint),
    );
    statusByPath = new Map(statuses.map((s) => [s.path, s]));
  } catch {
    /* node offline — still return DB rows */
  }

  return rows.map((r) => {
    const st =
      statusByPath.get(r.mountPoint) ??
      [...statusByPath.values()].find((s) => path.resolve(s.path) === path.resolve(r.mountPoint)) ??
      null;
    return toView(r, st);
  });
}

export async function createNodeStorage(
  nodeId: string,
  input: CreateNodeStorageInput,
): Promise<NodeStorageView> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) throw Object.assign(new Error("Node not found"), { status: 404 });

  const name = input.name.trim();
  if (!name || name.length > 64) throw new Error("Name is required (max 64 chars)");

  const id = nanoid(12);
  const baseDir = node.daemonBaseDirectory?.trim() || "/var/lib/guartrix";
  let mountPoint = input.mountPoint?.trim()
    ? assertAbsolutePath(input.mountPoint, "Mount point")
    : path.posix.join(baseDir, "mounts", id);

  let hostPath: string | null = null;
  let nfsServer: string | null = null;
  let nfsExport: string | null = null;
  let nfsOptions: string | null = null;

  if (input.type === "NFS") {
    nfsServer = (input.nfsServer ?? "").trim();
    nfsExport = (input.nfsExport ?? "").trim();
    if (!nfsServer || !nfsExport) throw new Error("NFS server and export are required");
    nfsExport = assertAbsolutePath(nfsExport, "NFS export");
    nfsOptions = (input.nfsOptions ?? DEFAULT_NFS_OPTS).trim() || DEFAULT_NFS_OPTS;
  } else {
    hostPath = assertAbsolutePath(input.hostPath?.trim() || mountPoint, "Host path");
    if (!input.mountPoint?.trim()) {
      mountPoint = hostPath;
    }
  }

  const diskMb = Math.max(0, Math.min(10_485_760, Number(input.diskMb) || 0));

  const row = await prisma.nodeStorage.create({
    data: {
      id,
      nodeId,
      name,
      type: input.type,
      mountPoint,
      hostPath,
      nfsServer,
      nfsExport,
      nfsOptions,
      diskMb,
      enabled: input.enabled !== false,
    },
    include: { _count: { select: { servers: true } } },
  });

  return toView(row, null);
}

export async function updateNodeStorage(
  nodeId: string,
  storageId: string,
  input: UpdateNodeStorageInput,
): Promise<NodeStorageView> {
  const existing = await prisma.nodeStorage.findFirst({
    where: { id: storageId, nodeId },
    include: { _count: { select: { servers: true } } },
  });
  if (!existing) throw Object.assign(new Error("Storage not found"), { status: 404 });

  const data: {
    name?: string;
    mountPoint?: string;
    hostPath?: string | null;
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
  if (input.mountPoint !== undefined) {
    data.mountPoint = assertAbsolutePath(input.mountPoint, "Mount point");
  }
  if (input.hostPath !== undefined) {
    data.hostPath = input.hostPath ? assertAbsolutePath(input.hostPath, "Host path") : null;
  }
  if (input.nfsServer !== undefined) data.nfsServer = input.nfsServer?.trim() || null;
  if (input.nfsExport !== undefined) {
    data.nfsExport = input.nfsExport
      ? assertAbsolutePath(input.nfsExport, "NFS export")
      : null;
  }
  if (input.nfsOptions !== undefined) data.nfsOptions = input.nfsOptions?.trim() || null;
  if (input.diskMb !== undefined) {
    data.diskMb = Math.max(0, Math.min(10_485_760, Number(input.diskMb) || 0));
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;

  // Type changes are not allowed after create (mount semantics differ).
  if (input.type !== undefined && input.type !== existing.type) {
    throw new Error("Cannot change storage type after create");
  }

  const row = await prisma.nodeStorage.update({
    where: { id: storageId },
    data,
    include: { _count: { select: { servers: true } } },
  });
  return toView(row, null);
}

export async function deleteNodeStorage(nodeId: string, storageId: string): Promise<void> {
  const existing = await prisma.nodeStorage.findFirst({
    where: { id: storageId, nodeId },
    include: { _count: { select: { servers: true } } },
  });
  if (!existing) throw Object.assign(new Error("Storage not found"), { status: 404 });
  if (existing._count.servers > 0) {
    throw new Error("Cannot delete storage while servers are assigned to it");
  }
  await prisma.nodeStorage.delete({ where: { id: storageId } });
}

export async function mountNodeStorage(
  nodeId: string,
  storageId: string,
): Promise<NodeStorageView> {
  const existing = await prisma.nodeStorage.findFirst({
    where: { id: storageId, nodeId },
    include: { _count: { select: { servers: true } } },
  });
  if (!existing) throw Object.assign(new Error("Storage not found"), { status: 404 });
  if (!existing.enabled) throw new Error("Storage is disabled");

  const { status } = await daemonStorageMount(nodeId, {
    type: existing.type === "NFS" ? "nfs" : "local",
    mountPoint: existing.mountPoint,
    hostPath: existing.hostPath,
    nfsServer: existing.nfsServer,
    nfsExport: existing.nfsExport,
    nfsOptions: existing.nfsOptions,
  });
  return toView(existing, status);
}

export async function unmountNodeStorage(
  nodeId: string,
  storageId: string,
  opts?: { force?: boolean; lazy?: boolean },
): Promise<NodeStorageView> {
  const existing = await prisma.nodeStorage.findFirst({
    where: { id: storageId, nodeId },
    include: { _count: { select: { servers: true } } },
  });
  if (!existing) throw Object.assign(new Error("Storage not found"), { status: 404 });

  const { status } = await daemonStorageUnmount(nodeId, {
    mountPoint: existing.mountPoint,
    force: opts?.force,
    lazy: opts?.lazy,
  });
  return toView(existing, status);
}

/** Validate storage belongs to node, is enabled; optionally sync daemon location. */
export async function assertServerStorageAssignable(
  nodeId: string,
  storageId: string | null | undefined,
): Promise<{ mountPoint: string | null }> {
  if (!storageId) return { mountPoint: null };
  const storage = await prisma.nodeStorage.findFirst({
    where: { id: storageId, nodeId },
  });
  if (!storage) throw new Error("Storage not found on this node");
  if (!storage.enabled) throw new Error("Storage is disabled");
  return { mountPoint: storage.mountPoint };
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
