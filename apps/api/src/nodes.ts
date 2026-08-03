import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { DaemonNode, NodeStatus } from "@msm/shared";
import { config } from "./config.js";
import {
  deleteNodeSftpDns,
  ensureNodeSftpDns,
  slugifySubdomain,
} from "./cloudflare-dns.js";
import { prisma } from "./db.js";
import { hostPublicIp } from "./host-resources.js";

const DAEMON_ENV_FILE = "daemon.env";
const DEFAULT_SFTP_PORT = 2022;

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

/** Host reserve for OS + panel + MySQL + Docker (~1.5 GB or 15%). */
export function nodeMemoryReserveMb(capacityMb: number): number {
  if (capacityMb <= 0) return 0;
  return Math.max(1536, Math.floor(capacityMb * 0.15));
}

export function serializeNode(
  node: {
    id: string;
    name: string;
    location?: string | null;
    fqdn: string;
    scheme: string;
    daemonPort: number;
    isLocal: boolean;
    memoryMb: number;
    mysqlPort?: number;
    sftpPort?: number;
    sftpHostname?: string | null;
    status: NodeStatus;
    lastSeenAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  serverCount = 0,
  memoryUsedMb = 0,
): DaemonNode {
  const capacity = Math.max(0, node.memoryMb);
  const used = Math.max(0, memoryUsedMb);
  const reserve = nodeMemoryReserveMb(capacity);
  const usableCap = capacity > 0 ? Math.max(0, capacity - reserve) : 0;
  const available = capacity > 0 ? Math.max(0, capacity - used) : 0;
  const usable = capacity > 0 ? Math.max(0, usableCap - used) : 0;
  return {
    id: node.id,
    name: node.name,
    location: node.location?.trim() ? node.location.trim() : null,
    fqdn: node.fqdn,
    scheme: node.scheme,
    daemonPort: node.daemonPort,
    isLocal: node.isLocal,
    memoryMb: capacity,
    memoryUsedMb: used,
    memoryAvailableMb: available,
    memoryReserveMb: reserve,
    memoryUsableMb: usable,
    mysqlPort: node.mysqlPort ?? 3306,
    sftpPort: node.sftpPort ?? DEFAULT_SFTP_PORT,
    sftpHostname: node.sftpHostname ?? null,
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

    const sftpPort =
      Number(process.env.SFTP_PORT ?? node.sftpPort ?? DEFAULT_SFTP_PORT) ||
      DEFAULT_SFTP_PORT;

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

/** Load all nodes with allocated RAM (sum of server.memoryMb). */
export async function listNodesWithUsage(): Promise<DaemonNode[]> {
  const nodes = await prisma.node.findMany({
    orderBy: [{ isLocal: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { servers: true } },
      servers: { select: { memoryMb: true } },
    },
  });
  return nodes.map((n) => {
    const used = n.servers.reduce((sum, s) => sum + s.memoryMb, 0);
    return serializeNode(n, n._count.servers, used);
  });
}

/** Ensure node exists and has enough free allocated RAM for `memoryMb`. */
export async function assertNodeCapacity(
  nodeId: string,
  memoryMb: number,
  opts?: { excludeServerId?: string },
): Promise<void> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: { servers: { select: { id: true, memoryMb: true } } },
  });
  if (!node) throw new Error("Node not found");
  if (node.memoryMb <= 0) {
    // Capacity unknown — allow create but warn is UI-side; still accept
    return;
  }
  // Reserve headroom for OS + panel + MySQL + Docker overhead (~1.5 GB or 15%)
  const reserveMb = nodeMemoryReserveMb(node.memoryMb);
  const usable = Math.max(0, node.memoryMb - reserveMb);
  const used = node.servers
    .filter((s) => s.id !== opts?.excludeServerId)
    .reduce((sum, s) => sum + s.memoryMb, 0);
  const available = usable - used;
  if (memoryMb > available) {
    const needGb = (memoryMb / 1024).toFixed(memoryMb % 1024 === 0 ? 0 : 1);
    const freeGb = (Math.max(0, available) / 1024).toFixed(
      available % 1024 === 0 ? 0 : 1,
    );
    throw new Error(
      `Not enough RAM on node "${node.name}": need ${needGb} GB, available ${freeGb} GB (host reserve ${(reserveMb / 1024).toFixed(1)} GB)`,
    );
  }
}

export async function resolveCreateNodeId(
  requestedId?: string | null,
): Promise<string> {
  if (requestedId) {
    const node = await prisma.node.findUnique({ where: { id: requestedId } });
    if (!node) throw new Error("Node not found");
    return node.id;
  }
  const local = await prisma.node.findFirst({ where: { isLocal: true } });
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
    `DOCKER_NETWORK_MODE=${(process.env.DOCKER_NETWORK_MODE ?? "shared").trim() || "shared"}`,
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
