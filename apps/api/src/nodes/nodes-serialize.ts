import type { DaemonNode, NodeStatus } from "@guartrix/shared";
import { hostPublicIp } from "./host-resources.js";
import {
  nodeAllocationBudget,
  nodePublicUrl,
  nodeSftpDisplayHost,
  parseNodeTags,
} from "./nodes-helpers.js";

const DEFAULT_SFTP_PORT = 2022;
const DEFAULT_UPLOAD_LIMIT_MB = 256;
const DEFAULT_BASE_DIR = "/var/lib/guartrix";

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
  const memoryExtra = memoryCap > 0 ? Math.max(0, memoryBudget - memoryCap) : 0;
  const memoryAvailable = memoryCap > 0 ? Math.max(0, memoryBudget - memUsed) : 0;
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
    uploadLimitMb: Math.max(1, node.uploadLimitMb ?? DEFAULT_UPLOAD_LIMIT_MB),
    daemonBaseDirectory: node.daemonBaseDirectory?.trim() || DEFAULT_BASE_DIR,
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
