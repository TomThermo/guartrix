import type { PanelVersionStatus } from "../version.js";
import type { ServerStatus } from "./server.js";

export interface SystemInfo {
  /** Host RAM as whole-GB × 1024 (matches 1 GB UI steps). */
  totalMemoryMb: number;
  totalMemoryGb: number;
  /** Machine hostname (shown as Node). */
  nodeName: string;
  /** Best-effort public/primary IPv4. */
  publicIp: string | null;
}

export type NodeStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

export interface DaemonNode {
  id: string;
  name: string;
  /** Optional region / location label (e.g. "eu-west"). */
  location: string | null;
  fqdn: string;
  scheme: string;
  daemonPort: number;
  /**
   * HTTPS to the panel’s connect URL while TLS terminates at a reverse proxy
   * (daemon may speak plain HTTP locally).
   */
  behindProxy: boolean;
  isLocal: boolean;
  /** Host / configured capacity in MB (0 = unknown). */
  memoryMb: number;
  /** Sum of allocated server memoryMb on this node. */
  memoryUsedMb: number;
  /** Remaining capacity before host reserve (matches assertNodeCapacity). */
  memoryUsableMb: number;
  /** Host reserve held back for OS/panel/Docker (0 if capacity unknown). */
  memoryReserveMb: number;
  /** Remaining capacity (memoryMb - memoryUsedMb), 0 if capacity unknown. */
  memoryAvailableMb: number;
  /** Published MySQL port on this node. */
  mysqlPort?: number;
  /** SFTP listen port (default 2022). */
  sftpPort: number;
  /** Public SFTP hostname (Cloudflare A record), if configured. */
  sftpHostname: string | null;
  /**
   * Trusted SSH host-key fingerprint for remote-install (OpenSSH SHA256:…).
   * Null until an admin has trusted a key via the install wizard.
   */
  sshHostKeyFingerprint: string | null;
  status: NodeStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  serverCount: number;
  /** Base URL derived from scheme/fqdn/port */
  publicUrl: string;
}

export interface CreateNodeRequest {
  name: string;
  fqdn: string;
  scheme?: "http" | "https";
  daemonPort?: number;
  behindProxy?: boolean;
  memoryMb?: number;
  /** Optional region / location label. */
  location?: string | null;
}

export interface UpdateNodeRequest {
  name?: string;
  fqdn?: string;
  scheme?: "http" | "https";
  daemonPort?: number;
  behindProxy?: boolean;
  memoryMb?: number;
  /** Optional region / location label; empty string clears. */
  location?: string | null;
}

export interface CreateNodeResponse {
  node: DaemonNode;
  /** Plaintext token — shown once. */
  token: string;
}

export interface NodeTestResult {
  ok: boolean;
  error?: string;
  system?: {
    hostname: string;
    totalMemoryMb: number;
    totalMemoryGb: number;
    publicIp: string | null;
    uptime: number;
    daemonVersion: string;
  };
}

/** One container as reported by a daemon, cross-referenced with its server (if any). */
export interface StatusContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: string;
  ports: string;
  serverId: string | null;
  serverName: string | null;
  serverStatus: ServerStatus | null;
  isMysql: boolean;
  /** Normalized against host core count, capped at 100. */
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  memoryUsedLabel: string;
  memoryLimitLabel: string;
}

/** Per-node health snapshot for the /statusline admin dashboard. */
export interface StatusNode {
  id: string;
  name: string;
  isLocal: boolean;
  publicUrl: string;
  reachable: boolean;
  error?: string;
  daemon?: {
    hostname: string;
    publicIp: string | null;
    localIps: Array<{ iface: string; address: string }>;
    osVersion: string;
    arch: string;
    cpuCount: number;
    loadAvg: [number, number, number];
    dockerVersion: string;
    daemonVersion: string;
    daemonPid: number;
    daemonPort: number;
    daemonMemoryRssMb: number;
    uptime: number;
    totalMemoryMb: number;
    totalMemoryGb: number;
    freeMemoryMb: number;
    disk: {
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usedPercent: number;
      totalLabel: string;
      usedLabel: string;
      freeLabel: string;
    } | null;
  };
  mysql?: {
    running: boolean;
    container: string;
    image: string;
    host: string;
    port: number;
  } | null;
  /** Embedded SFTP server on this node (FileZilla / WinSCP). */
  sftp?: {
    listening: boolean;
    port: number;
    hostname: string | null;
  } | null;
  containers: StatusContainer[];
}

/** Live snapshot for one node — GET /api/admin/nodes/:id/status */
export interface AdminNodeStatusResponse {
  id: string;
  name: string;
  isLocal: boolean;
  publicUrl: string;
  reachable: boolean;
  error?: string;
  generatedAt: string;
  daemon?: StatusNode["daemon"];
  mysql?: StatusNode["mysql"];
  sftp?: StatusNode["sftp"];
}

/** Aggregated response for GET /api/admin/status (admin-only). */
export interface AdminStatusResponse {
  generatedAt: string;
  /**
   * Panel processes on the control plane (not game nodes).
   * Web + API = panel; each node runs a daemon.
   */
  panel: {
    web: {
      ok: boolean;
      pid: number | null;
      httpPort: number;
      httpsPort: number | null;
      publicHost: string;
      url: string;
    };
    api: {
      ok: true;
      pid: number;
      uptime: number;
      memoryRssMb: number;
      nodeVersion: string;
      port: number;
    };
    watchdog: {
      ok: boolean;
      pid: number | null;
    };
    /** Product version vs license-server channel (when reachable). */
    version?: PanelVersionStatus;
    /** Optional Redis (multi-API HA). */
    redis?: {
      configured: boolean;
      enabled: boolean;
      connected: boolean;
      urlMasked: string | null;
      latencyMs: number | null;
      error: string | null;
      sessionStore: string;
      rateLimitStore: string;
    };
  };
  nodes: StatusNode[];
}

export interface DiskUsageBreakdown {
  totalBytes: number;
  totalLabel: string;
  worldBytes: number;
  worldLabel: string;
  modsPluginsBytes: number;
  modsPluginsLabel: string;
  backupsBytes: number;
  backupsLabel: string;
  otherBytes: number;
  otherLabel: string;
}

export interface PortAllocation {
  id: string;
  nodeId: string;
  ip: string;
  port: number;
  protocol: "tcp" | "udp";
  notes: string | null;
  serverId: string | null;
  serverName: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAllocationsRequest {
  /** Single port or inclusive range start. */
  portStart: number;
  /** Inclusive range end (defaults to portStart). */
  portEnd?: number;
  protocol?: "tcp" | "udp";
  ip?: string;
  notes?: string;
}

export interface AssignAllocationRequest {
  /** Assign an existing free allocation by id. */
  allocationId?: string;
  /** Or create+assign a specific port on the server's node. */
  port?: number;
  protocol?: "tcp" | "udp";
  notes?: string;
}
