import type { DiskUsageBreakdown } from "./nodes.js";
import type {
  AddonKind,
  AddonSortIndex,
  McServer,
  ServerProperties,
  ServerStatus,
  ServerType,
} from "./server.js";

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

export type BotStatus = "connecting" | "online" | "error" | "disconnected";

export interface BotInfo {
  username: string;
  status: BotStatus;
  error: string | null;
  joinedAt: string | null;
  /** What the bot is currently doing (idle, following, wandering, …). */
  activity: string | null;
}

export interface SpawnBotsRequest {
  /** Number of bots to spawn (default 10, max 20). */
  count?: number;
  /** Username prefix, e.g. "Bot" → Bot1…BotN (default "Bot"). */
  prefix?: string;
}

export type BotCommandRequest =
  | { type: "say"; text: string }
  | { type: "look"; yaw: number; pitch: number }
  | { type: "quit" }
  | { type: "stop" }
  | { type: "jump" }
  | { type: "goto"; x?: number; y?: number; z?: number; player?: string }
  | { type: "follow"; player: string }
  | { type: "attack"; player?: string }
  | { type: "collect"; item?: string; count?: number }
  | { type: "chop"; block?: string }
  | { type: "dig"; block?: string }
  | { type: "wander" }
  | { type: "guard"; radius?: number }
  | { type: "ai"; prompt: string };

export interface BotsListResponse {
  bots: BotInfo[];
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
  /** Container uptime in ms when known (Wings-compatible). */
  uptimeMs?: number;
  memoryUsedLabel: string;
  memoryLimitLabel: string;
  networkRxLabel: string;
  networkTxLabel: string;
  blockReadLabel: string;
  blockWriteLabel: string;
  disk?: DiskUsageBreakdown;
}

export interface AddonSearchHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  author: string;
  categories: string[];
}

export interface AddonGalleryImage {
  url: string;
  featured: boolean;
  title: string | null;
  description: string | null;
  ordering: number;
}

export interface AddonProjectDetails {
  projectId: string;
  slug: string;
  projectType: string;
  title: string;
  description: string;
  body: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  categories: string[];
  gallery: AddonGalleryImage[];
  clientSide: string;
  serverSide: string;
  license: string | null;
  sourceUrl: string | null;
  issuesUrl: string | null;
  wikiUrl: string | null;
  discordUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  modrinthUrl: string;
  authors: string[];
}

export interface AddonSearchResponse {
  type: ServerType;
  mcVersion: string;
  kind: AddonKind | null;
  hits: AddonSearchHit[];
  totalHits: number;
  offset: number;
  limit: number;
  index: AddonSortIndex;
  category: string | null;
}

export interface AddonCategory {
  name: string;
  label: string;
}

export interface AddonVersionInfo {
  versionId: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  fileName: string;
  fileUrl: string;
  fileSize: number;
  releaseChannel: string;
  changelog?: string | null;
  datePublished?: string | null;
  dependencies?: AddonDependency[];
}

export interface AddonDependency {
  projectId: string | null;
  versionId: string | null;
  dependencyType: "required" | "optional" | "incompatible" | "embedded" | string;
}

export interface InstalledAddon {
  /** `modrinth` = matched via Modrinth; `local` = jar on disk without Modrinth match. */
  source: "modrinth" | "local";
  kind: AddonKind;
  projectId: string;
  slug: string;
  title: string;
  versionId: string;
  versionNumber: string;
  fileName: string;
  gameVersions: string[];
  installedAt: string;
  iconUrl?: string | null;
  description?: string | null;
  author?: string | null;
  categories?: string[];
}

export interface AddonSyncResult {
  installed: InstalledAddon[];
  /** Newly matched or local-tracked jars. */
  added: InstalledAddon[];
  /** Manifest entries removed because the jar is gone. */
  removed: InstalledAddon[];
  /** Extra jars for the same Modrinth project (not in manifest). */
  duplicates: string[];
  folder: string;
  jarCount: number;
}

/** Update availability for one installed Modrinth addon. */
export interface InstalledAddonUpdate {
  projectId: string;
  currentVersionId: string;
  currentVersionNumber: string;
  latestVersionId: string;
  latestVersionNumber: string;
  available: boolean;
}

export interface AddonInstallResult {
  installed: InstalledAddon;
  dependenciesInstalled: InstalledAddon[];
  alreadyPresent: InstalledAddon[];
  restartRequired: boolean;
}

export type BackupScheduleMode = "off" | "interval" | "daily";

export interface BackupSchedule {
  mode: BackupScheduleMode;
  /** Used when mode === "interval" (1–168). */
  intervalHours: number;
  /** Local server time HH:mm when mode === "daily". */
  dailyAt: string;
  /** How many backups to keep (1–50). */
  keepCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface ServerBackup {
  id: string;
  fileName: string;
  sizeBytes: number;
  sizeLabel: string;
  createdAt: string;
  note: string | null;
  trigger: "manual" | "scheduled" | "uploaded";
  /** True when archive is AES-GCM sealed on disk (`.tar.gz.enc`). */
  encrypted?: boolean;
}

export interface BackupListResponse {
  backups: ServerBackup[];
  schedule: BackupSchedule;
  busy: boolean;
  /** Panel has BACKUP_ENCRYPTION enabled for new backups. */
  encryptionEnabled?: boolean;
  limits?: {
    maxUploadBytes: number;
    chunkBytes: number;
  };
}

/** Max size for uploaded backup archives (20 GiB). */
export const BACKUP_UPLOAD_MAX_BYTES = 20 * 1024 * 1024 * 1024;
/** Chunk size for backup upload/download (1 MiB — frequent progress + proxy-friendly). */
export const BACKUP_TRANSFER_CHUNK_BYTES = 1 * 1024 * 1024;
/** Parallel chunk uploads (keep low on residential uplinks). */
export const BACKUP_UPLOAD_CONCURRENCY = 3;

/** Max size for File Manager uploads (2 GiB; streamed via temp, not buffered in RAM). */
export const FILE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export interface BackupUploadInitRequest {
  fileName: string;
  sizeBytes: number;
  note?: string;
}

export interface BackupUploadInitResponse {
  uploadId: string;
  backupId: string;
  chunkSize: number;
  totalChunks: number;
  maxBytes: number;
}

export interface BackupUploadStatusResponse {
  uploadId: string;
  backupId: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  receivedBytes: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
  editable: boolean;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileContentResponse {
  path: string;
  content: string;
  editable: boolean;
}

/** Curated Paper/Purpur plugin stacks (Modrinth project ids). */
export interface PluginStackItem {
  projectId: string;
  slug: string;
  name: string;
  /** Optional Modrinth version id for reproducible installs. */
  versionId?: string;
  /** Human version label when versionId is pinned. */
  versionNumber?: string;
}

export interface PluginStack {
  id: string;
  name: string;
  description: string;
  items: PluginStackItem[];
}

export const RECOMMENDED_PLUGIN_STACKS: PluginStack[] = [
  {
    id: "essentials",
    name: "Essentials",
    description: "Core survival utilities: homes, kits, warps, and moderation basics.",
    items: [
      { projectId: "hXiIvTyT", slug: "essentialsx", name: "EssentialsX" },
      { projectId: "Vebnzrzj", slug: "luckperms", name: "LuckPerms" },
    ],
  },
  {
    id: "moderation",
    name: "Moderation & audit",
    description: "Permissions, rollback, and performance insight.",
    items: [
      { projectId: "Vebnzrzj", slug: "luckperms", name: "LuckPerms" },
      { projectId: "Lu3KuzdV", slug: "coreprotect", name: "CoreProtect" },
      { projectId: "l6YH9Als", slug: "spark", name: "spark" },
    ],
  },
  {
    id: "map",
    name: "Live map",
    description: "In-browser explored-chunk map (BlueMap).",
    items: [
      { projectId: "swbUV1cr", slug: "bluemap", name: "BlueMap" },
    ],
  },
];
