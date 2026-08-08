import type { McServer, ServerProperties, ServerStatus } from "./server.js";
import type { DiskUsageBreakdown } from "./nodes.js";

export interface LogFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
}

export interface LogContentResponse {
  path: string;
  content: string;
  truncated: boolean;
  sizeBytes: number;
}

export interface ConnectInfo {
  host: string;
  port: number;
  address: string;
  /** Public IPv4 when host is a hostname (optional). */
  directIp?: string | null;
  /** FQDN subdomain when Cloudflare DNS is configured. */
  subdomain?: string | null;
  motd: string;
  maxPlayers: string;
  onlineMode: boolean;
  whitelistEnabled: boolean;
  mcVersion: string;
  /** Currently online players (best-effort; 0 when stopped). */
  onlinePlayers: number;
  /** Parsed max-players as number. */
  playersMax: number;
  serverStatus: ServerStatus;
  /** SFTP endpoint for file access (Ferox-style). */
  sftpEnabled?: boolean;
  sftpHost?: string | null;
  sftpPort?: number | null;
  /** `{username}.{serverId}` — password is the panel password. */
  sftpUsername?: string | null;
}

export interface PlayerModerationEvent {
  id: string;
  serverId: string;
  playerName: string;
  uuid: string | null;
  action: string;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface PlayerEntry {
  name: string;
  uuid: string;
}

export interface BanEntry {
  name: string;
  uuid: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

export interface IpBanEntry {
  ip: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

export interface BansResponse {
  players: BanEntry[];
  ips: IpBanEntry[];
}

export interface OpEntry extends PlayerEntry {
  level: number;
  bypassesPlayerLimit: boolean;
}

export interface OnlinePlayer {
  name: string;
  uuid: string | null;
}

export interface PlayerHistoryEntry {
  name: string;
  uuid: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastJoinedAt: string | null;
  lastLeftAt: string | null;
  online: boolean;
}

export interface OnlinePlayersResponse {
  online: boolean;
  playersOnline: number;
  playersMax: number;
  players: OnlinePlayer[];
  history: PlayerHistoryEntry[];
  source: "console" | "ping" | "both" | "none";
  latencyMs: number | null;
}

export interface PlayersResponse {
  whitelist: PlayerEntry[];
  ops: OpEntry[];
  bannedPlayers: BanEntry[];
}

export interface ServerDetail extends McServer {
  properties: ServerProperties;
  players: PlayersResponse;
}

export type ConsoleMessage =
  | { type: "output"; line: string; stream: "stdout" | "stderr" }
  | { type: "status"; status: ServerStatus }
  | { type: "history"; lines: string[] }
  | { type: "stats"; stats: ServerStats }
  | { type: "error"; message: string };

export interface ConsoleCommand {
  type: "command";
  command: string;
}

/** Live online-player updates — `/ws/servers/:id/players` (requires `player.read`). */
export type PlayersWsMessage =
  | { type: "snapshot"; data: OnlinePlayersResponse }
  | { type: "players"; players: string[]; online?: boolean }
  | { type: "status"; online: boolean }
  | { type: "error"; message: string };

export interface ServerStats {
  running: boolean;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
  /** Container uptime in ms when known. */
  uptimeMs?: number;
  memoryUsedLabel: string;
  memoryLimitLabel: string;
  networkRxLabel: string;
  networkTxLabel: string;
  blockReadLabel: string;
  blockWriteLabel: string;
  disk?: DiskUsageBreakdown;
}
