import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { DaemonNode, NodeStatus } from "@msm/shared";
import { config } from "../config.js";
import {
  deleteNodeSftpDns,
  ensureNodeSftpDns,
  slugifySubdomain,
} from "./cloudflare-dns.js";
import { prisma } from "../db.js";
import { hostPublicIp } from "./host-resources.js";

const DAEMON_ENV_FILE = "daemon.env";
const DEFAULT_SFTP_PORT = 2022;
const DEFAULT_UPLOAD_LIMIT_MB = 256;
const DEFAULT_BASE_DIR = "/var/lib/guartrix";

export function hashDaemonToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateDaemonToken(): string {
  return randomBytes(32).toString("hex");
}

export async function findNodeByDaemonToken(token: string) {
  const tokenHash = hashDaemonToken(token);
  return prisma.node.findFirst({ where: { tokenHash } });
}

export function nodePublicUrl(node: {
  scheme: string;
  fqdn: string;
  daemonPort: number;
}): string {
  const defaultPort =
    node.scheme === "https" ? 443 : node.scheme === "http" ? 80 : null;
  if (defaultPort !== null && node.daemonPort === defaultPort) {
    return `${node.scheme}://${node.fqdn}`;
  }
  return `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
}

/** Parse Node.tags JSON into a string[]. */
export function parseNodeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parseNodeTags(parsed);
    } catch {
      return raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** Budget after overallocate % (0 limit = unlimited → 0). */
export function nodeAllocationBudget(
  limit: number,
  overallocatePercent: number,
): number {
  if (limit <= 0) return 0;
  const over = Math.max(0, Math.min(1000, Math.floor(overallocatePercent || 0)));
  return Math.floor((limit * (100 + over)) / 100);
}

/** Host string shown to SFTP clients. */
export function nodeSftpDisplayHost(node: {
  sftpAlias?: string | null;
  sftpHostname?: string | null;
  fqdn: string;
}): string {
  const alias = node.sftpAlias?.trim();
  if (alias) return alias;
  const host = node.sftpHostname?.trim();
  if (host) return host;
  return node.fqdn;
}

/** @deprecated Prefer nodeAllocationBudget — kept for callers expecting reserve MiB. */
export function nodeMemoryReserveMb(capacityMb: number): number {
  if (capacityMb <= 0) return 0;
  return Math.max(1536, Math.floor(capacityMb * 0.15));
}

type SerializeNodeInput = {
  id: string;
  uuid?: string | null;
  name: string;
  location?: string | null;
  tags?: unknown;
  fqdn: string;
  scheme: string;
  daemonPort: number;
  behindProxy?: boolean;
  isLocal: boolean;
  memoryMb: number;
  memoryOverallocate?: number;
  diskMb?: number;
  diskOverallocate?: number;
  cpuLimit?: number;
  cpuOverallocate?: number;
  uploadLimitMb?: number;
  daemonBaseDirectory?: string | null;
  mysqlPort?: number;
  sftpPort?: number;
  sftpHostname?: string | null;
  sftpAlias?: string | null;
  deployable?: boolean;
  maintenanceMode?: boolean;
  sshHostKeyFingerprint?: string | null;
  status: NodeStatus;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeNode(
  node: SerializeNodeInput,
  serverCount = 0,
  memoryUsedMb = 0,
  diskUsedMb = 0,
  cpuUsed = 0,
): DaemonNode {
  const memoryCap = Math.max(0, node.memoryMb);
  const memoryOver = Math.max(0, node.memoryOverallocate ?? 0);
  const memoryBudget = nodeAllocationBudget(memoryCap, memoryOver);
  const memUsed = Math.max(0, memoryUsedMb);
  const memoryExtra =
    memoryCap > 0 ? Math.max(0, memoryBudget - memoryCap) : 0;
  const memoryAvailable =
    memoryCap > 0 ? Math.max(0, memoryBudget - memUsed) : 0;
  const memoryUsable = memoryAvailable;

  const diskCap = Math.max(0, node.diskMb ?? 0);
  const diskOver = Math.max(0, node.diskOverallocate ?? 0);
  const diskBudget = nodeAllocationBudget(diskCap, diskOver);
  const dUsed = Math.max(0, diskUsedMb);
  const diskUsable = diskCap > 0 ? Math.max(0, diskBudget - dUsed) : 0;

  const cpuCap = Math.max(0, node.cpuLimit ?? 0);
  const cpuOver = Math.max(0, node.cpuOverallocate ?? 0);
  const cpuBudget = nodeAllocationBudget(cpuCap, cpuOver);
  const cUsed = Math.max(0, cpuUsed);
  const cpuUsable = cpuCap > 0 ? Math.max(0, cpuBudget - cUsed) : 0;

  const displayHost = nodeSftpDisplayHost(node);

  return {
    id: node.id,
    uuid: node.uuid?.trim() || node.id,
    name: node.name,
    location: node.location?.trim() ? node.location.trim() : null,
    tags: parseNodeTags(node.tags),
    fqdn: node.fqdn,
    scheme: node.scheme,
    daemonPort: node.daemonPort,
    behindProxy: Boolean(node.behindProxy),
    isLocal: node.isLocal,
    memoryMb: memoryCap,
    memoryOverallocate: memoryOver,
    memoryUsedMb: memUsed,
    memoryAvailableMb: memoryAvailable,
    memoryReserveMb: memoryExtra,
    memoryUsableMb: memoryUsable,
    diskMb: diskCap,
    diskOverallocate: diskOver,
    diskUsedMb: dUsed,
    diskUsableMb: diskUsable,
    cpuLimit: cpuCap,
    cpuOverallocate: cpuOver,
    cpuUsed: cUsed,
    cpuUsable,
    uploadLimitMb: Math.max(
      1,
      node.uploadLimitMb ?? DEFAULT_UPLOAD_LIMIT_MB,
    ),
    daemonBaseDirectory:
      node.daemonBaseDirectory?.trim() || DEFAULT_BASE_DIR,
    mysqlPort: node.mysqlPort ?? 3306,
    sftpPort: node.sftpPort ?? DEFAULT_SFTP_PORT,
    sftpHostname: node.sftpHostname ?? null,
    sftpAlias: node.sftpAlias?.trim() ? node.sftpAlias.trim() : null,
    sftpDisplayHost: displayHost || null,
    deployable: node.deployable !== false,
    maintenanceMode: Boolean(node.maintenanceMode),
    sshHostKeyFingerprint: node.sshHostKeyFingerprint?.trim()
      ? node.sshHostKeyFingerprint.trim()
      : null,
    status: node.status,
    lastSeenAt: node.lastSeenAt?.toISOString() ?? null,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
    serverCount,
    publicUrl: nodePublicUrl(node),
  };
}

function isPublicIpv4(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return false;
  if (a === 169 && b === 254) return false;
  return true;
}

/** Resolve IPv4 for a node's public SFTP A record. */
export function resolveNodePublicIpv4(
  node: { fqdn: string; isLocal: boolean },
  reportedIp?: string | null,
): string | null {
  if (reportedIp && isPublicIpv4(reportedIp)) {
    return reportedIp;
  }
  if (isPublicIpv4(node.fqdn)) {
    return node.fqdn;
  }
  const fromEnv = process.env.PUBLIC_IP?.trim();
  if (fromEnv && isPublicIpv4(fromEnv)) {
    return fromEnv;
  }
  const detected = hostPublicIp();
  if (detected && isPublicIpv4(detected)) {
    return detected;
  }
  return null;
}

/**
 * Ensure Cloudflare A record for this node's SFTP hostname and persist fields.
 */
export async function syncNodeSftpDns(
  nodeId: string,
  reportedIp?: string | null,
): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return;

  const ipv4 = resolveNodePublicIpv4(node, reportedIp);
  if (!ipv4) {
    console.warn(
      `[guartrix] Skipping SFTP DNS for node ${node.name}: no public IPv4`,
    );
    return;
  }

  try {
    const dns = await ensureNodeSftpDns({
      preferredSlug: slugifySubdomain(node.name),
      ipv4,
      currentSlug: node.sftpDnsSlug,
    });
    if (!dns) return;

    const sftpPort = node.sftpPort || DEFAULT_SFTP_PORT;

    if (
      node.sftpHostname !== dns.fqdn ||
      node.sftpDnsSlug !== dns.slug ||
      node.sftpPort !== sftpPort
    ) {
      await prisma.node.update({
        where: { id: node.id },
        data: {
          sftpHostname: dns.fqdn,
          sftpDnsSlug: dns.slug,
          sftpPort,
        },
      });
      console.info(
        `[guartrix] SFTP hostname for node "${node.name}": ${dns.fqdn}:${sftpPort}`,
      );
    }
  } catch (err) {
    console.warn(
      `[guartrix] SFTP DNS sync failed for node ${node.name}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function removeNodeSftpDns(nodeId: string): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node?.sftpDnsSlug) return;
  await deleteNodeSftpDns(node.sftpDnsSlug).catch(() => undefined);
}

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
    /** Enforce deployable + not under maintenance (create / transfer). */
    placement?: boolean;
  },
): Promise<void> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      servers: {
        select: { id: true, memoryMb: true, diskMb: true, cpuLimit: true },
      },
    },
  });
  if (!node) throw new Error("Node not found");
  if (opts?.placement) {
    if (node.maintenanceMode) {
      throw new Error(
        `Node "${node.name}" is under maintenance — cannot place servers there`,
      );
    }
    if (node.deployable === false) {
      throw new Error(
        `Node "${node.name}" is not enabled for deployments`,
      );
    }
  }

  const others = node.servers.filter((s) => s.id !== opts?.excludeServerId);

  if (node.memoryMb > 0) {
    const budget = nodeAllocationBudget(
      node.memoryMb,
      node.memoryOverallocate ?? 0,
    );
    const used = others.reduce((sum, s) => sum + s.memoryMb, 0);
    const available = budget - used;
    if (memoryMb > available) {
      const needGb = (memoryMb / 1024).toFixed(memoryMb % 1024 === 0 ? 0 : 1);
      const freeGb = (Math.max(0, available) / 1024).toFixed(
        available % 1024 === 0 ? 0 : 1,
      );
      throw new Error(
        `Not enough RAM on node "${node.name}": need ${needGb} GB, available ${freeGb} GB`,
      );
    }
  }

  const wantDisk = opts?.diskMb;
  if (wantDisk !== undefined && (node.diskMb ?? 0) > 0) {
    const budget = nodeAllocationBudget(
      node.diskMb,
      node.diskOverallocate ?? 0,
    );
    const used = others.reduce((sum, s) => sum + (s.diskMb ?? 0), 0);
    const available = budget - used;
    if (wantDisk > available) {
      throw new Error(
        `Not enough disk on node "${node.name}": need ${wantDisk} MiB, available ${Math.max(0, available)} MiB`,
      );
    }
  }

  const wantCpu = opts?.cpuLimit;
  if (wantCpu !== undefined && (node.cpuLimit ?? 0) > 0) {
    const budget = nodeAllocationBudget(
      node.cpuLimit,
      node.cpuOverallocate ?? 0,
    );
    const used = others.reduce((sum, s) => sum + (s.cpuLimit ?? 0), 0);
    const available = budget - used;
    if (wantCpu > available) {
      throw new Error(
        `Not enough CPU on node "${node.name}": need ${wantCpu}%, available ${Math.max(0, available)}%`,
      );
    }
  }
}

export async function resolveCreateNodeId(
  requestedId?: string | null,
): Promise<string> {
  if (requestedId) {
    const node = await prisma.node.findUnique({ where: { id: requestedId } });
    if (!node) throw new Error("Node not found");
    if (node.maintenanceMode) {
      throw new Error(`Node "${node.name}" is under maintenance`);
    }
    if (!node.deployable) {
      throw new Error(`Node "${node.name}" is not enabled for deployments`);
    }
    return node.id;
  }
  const local = await prisma.node.findFirst({
    where: { isLocal: true, deployable: true, maintenanceMode: false },
  });
  if (!local) throw new Error("No local node configured");
  return local.id;
}

function readDaemonEnvValue(file: string, key: string): string | null {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const match = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
    const val = match?.[1]?.trim();
    return val || null;
  } catch {
    return null;
  }
}

function writeLocalDaemonEnv(token: string, port: number, nodeId: string): void {
  const file = path.join(config.dataDir, DAEMON_ENV_FILE);
  const mysqlPassword =
    process.env.MYSQL_ROOT_PASSWORD?.trim() ||
    readDaemonEnvValue(file, "MYSQL_ROOT_PASSWORD") ||
    randomBytes(24).toString("hex");
  process.env.MYSQL_ROOT_PASSWORD = mysqlPassword;
  const mysqlPort =
    process.env.MYSQL_PORT?.trim() ||
    readDaemonEnvValue(file, "MYSQL_PORT") ||
    "3306";
  process.env.MYSQL_PORT = mysqlPort;
  const publicIp =
    process.env.PUBLIC_IP?.trim() ||
    readDaemonEnvValue(file, "PUBLIC_IP") ||
    hostPublicIp() ||
    "";
  const sftpPort =
    process.env.SFTP_PORT?.trim() ||
    readDaemonEnvValue(file, "SFTP_PORT") ||
    String(DEFAULT_SFTP_PORT);
  const panelUrl =
    process.env.PANEL_URL?.trim() ||
    `http://127.0.0.1:${process.env.API_PORT ?? 3001}`;
  // Bind port for the local process. When DAEMON_PUBLIC_HOST is set, node.daemonPort
  // is the public HTTPS port (443) and must not be written as the loopback listen port
  // (prod-web already owns :443). Prefer DAEMON_PROXY_PORT / 8081 in that case.
  const bindPort = process.env.DAEMON_PUBLIC_HOST?.trim()
    ? Number(process.env.DAEMON_PROXY_PORT || process.env.DAEMON_BIND_PORT || 8081) ||
      8081
    : Number(process.env.DAEMON_PORT ?? port) || port || 8081;
  const body = [
    `# Generated by Guartrix panel — do not commit`,
    `DAEMON_TOKEN=${token}`,
    `DAEMON_NODE_ID=${nodeId}`,
    `DAEMON_PORT=${bindPort}`,
    `DAEMON_HOST=127.0.0.1`,
    `DATA_DIR=${config.dataDir}`,
    `PUBLIC_HOST=${config.publicHost}`,
    ...(publicIp ? [`PUBLIC_IP=${publicIp}`] : []),
    `PANEL_URL=${panelUrl}`,
    `SFTP_PORT=${sftpPort}`,
    `SFTP_ENABLED=true`,
    `DOCKER_IMAGE=${config.dockerImage}`,
    `DOCKER_NETWORK_MODE=${(process.env.DOCKER_NETWORK_MODE ?? "per_server").trim() || "per_server"}`,
    `MYSQL_ROOT_PASSWORD=${mysqlPassword}`,
    `MYSQL_PORT=${mysqlPort}`,
    `MYSQL_IMAGE=${process.env.MYSQL_IMAGE ?? "mysql:8.4"}`,
    `# Short-lived HS256 JWTs signed with DAEMON_TOKEN (Wings-style). Set DAEMON_JWT_LEGACY=true only for old daemons.`,
    `DAEMON_JWT_TTL=${process.env.DAEMON_JWT_TTL?.trim() || "900"}`,
    `DAEMON_JWT_WS_TTL=${process.env.DAEMON_JWT_WS_TTL?.trim() || "3600"}`,
    `DAEMON_JWT_LEGACY=${process.env.DAEMON_JWT_LEGACY?.trim() || "false"}`,
    "",
  ].join("\n");
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o600 });
}

export function writeLocalDaemonEnvIfLocal(
  token: string,
  port: number,
  nodeId?: string,
): void {
  if (!nodeId) {
    // Best-effort: keep previous NODE_ID from env file if caller omitted it
    const existing =
      readDaemonEnvValue(path.join(config.dataDir, DAEMON_ENV_FILE), "DAEMON_NODE_ID") ||
      "";
    writeLocalDaemonEnv(token, port, existing || "unknown");
    return;
  }
  writeLocalDaemonEnv(token, port, nodeId);
}

/** Ensure a local node exists; write data/daemon.env for the local daemon process. */
export async function ensureLocalNode(): Promise<{
  nodeId: string;
  token: string;
}> {
  const existing = await prisma.node.findFirst({ where: { isLocal: true } });
  const port = Number(process.env.DAEMON_PORT ?? 8081);
  const fqdn = process.env.DAEMON_FQDN ?? "127.0.0.1";

  if (existing) {
    // Prefer token from env / daemon.env so restarts stay in sync
    let token =
      process.env.DAEMON_TOKEN?.trim() ||
      readTokenFromDaemonEnv() ||
      "";
    if (!token) {
      token = generateDaemonToken();
      await prisma.node.update({
        where: { id: existing.id },
        data: { tokenHash: hashDaemonToken(token) },
      });
      writeLocalDaemonEnv(token, port, existing.id);
    } else if (hashDaemonToken(token) !== existing.tokenHash) {
      await prisma.node.update({
        where: { id: existing.id },
        data: { tokenHash: hashDaemonToken(token) },
      });
      writeLocalDaemonEnv(token, port, existing.id);
    } else {
      writeLocalDaemonEnv(token, port, existing.id);
    }

    // Assign servers missing a node
    const assigned = await prisma.server.updateMany({
      where: { nodeId: null },
      data: { nodeId: existing.id },
    });
    if (assigned.count > 0) {
      console.info(
        `[guartrix] Migrated ${assigned.count} server(s) onto local node ${existing.name}`,
      );
    }

    await syncNodeSftpDns(existing.id);
    return { nodeId: existing.id, token };
  }

  const token = process.env.DAEMON_TOKEN?.trim() || generateDaemonToken();
  const node = await prisma.node.create({
    data: {
      id: nanoid(12),
      name: "Local",
      fqdn,
      scheme: "http",
      daemonPort: port,
      tokenHash: hashDaemonToken(token),
      isLocal: true,
      status: "UNKNOWN",
      sftpPort:
        Number(process.env.SFTP_PORT ?? DEFAULT_SFTP_PORT) || DEFAULT_SFTP_PORT,
    },
  });

  writeLocalDaemonEnv(token, port, node.id);

  const migrated = await prisma.server.updateMany({
    where: { nodeId: null },
    data: { nodeId: node.id },
  });
  console.info(
    `[guartrix] Created local node "${node.name}" and assigned ${migrated.count} server(s)`,
  );

  await syncNodeSftpDns(node.id);
  return { nodeId: node.id, token };
}

function readTokenFromDaemonEnv(): string | null {
  try {
    const raw = fs.readFileSync(path.join(config.dataDir, DAEMON_ENV_FILE), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^DAEMON_TOKEN=(.*)$/.exec(line.trim());
      if (m) return m[1]!.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

export function getLocalDaemonToken(): string {
  return process.env.DAEMON_TOKEN?.trim() || readTokenFromDaemonEnv() || "";
}

export async function getNodeForServer(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });
  if (!server) return null;
  if (server.node) return server.node;
  const local = await prisma.node.findFirst({ where: { isLocal: true } });
  if (local) {
    await prisma.server.update({
      where: { id: serverId },
      data: { nodeId: local.id },
    });
    return local;
  }
  return null;
}
