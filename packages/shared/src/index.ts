export type ServerType =
  | "VANILLA"
  | "PAPER"
  | "FABRIC"
  | "FORGE"
  | "PURPUR"
  | "NEOFORGE"
  | "QUILT";

export type UserRole = "ADMIN" | "OPERATOR" | "VIEWER";

/** Human-readable role labels for the UI. */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "OPERATOR":
      return "User";
    case "VIEWER":
      return "Viewer";
  }
}

export type AddonKind = "plugin" | "mod";

export type AddonSortIndex =
  | "relevance"
  | "downloads"
  | "follows"
  | "newest"
  | "updated";

export function addonKindFor(type: ServerType): AddonKind | null {
  if (type === "PAPER" || type === "PURPUR") return "plugin";
  if (type === "FABRIC" || type === "FORGE" || type === "NEOFORGE" || type === "QUILT") {
    return "mod";
  }
  return null;
}

export const ALL_SERVER_TYPES: ServerType[] = [
  "VANILLA",
  "PAPER",
  "PURPUR",
  "FABRIC",
  "QUILT",
  "FORGE",
  "NEOFORGE",
];

export type ServerStatus =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "ERROR"
  | "CREATING"
  | "TRANSFERRING";

export interface McServer {
  id: string;
  name: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  memoryMb: number;
  /** Disk quota in MB (0 = unlimited). */
  diskMb: number;
  /** CPU limit as % of one core (100 = 1.0 CPU). 0 = unlimited. */
  cpuLimit: number;
  status: ServerStatus;
  /** Java major version for the Docker runtime ("8" | "11" | "17" | "21" | "25"). */
  javaVersion: string;
  /** Custom startup template; null = default. Supports {{MEMORY}} and {{JAR}}. */
  startupCommand: string | null;
  /** Jar filename to run (e.g. server.jar). */
  serverJar: string;
  /** @deprecated use javaVersion — kept for older clients */
  javaPath: string | null;
  fabricLoaderVersion: string | null;
  forgeVersion: string | null;
  paperBuild: number | null;
  errorMessage: string | null;
  hasIcon: boolean;
  /** From server.properties white-list */
  whitelistEnabled: boolean;
  autoRestart: boolean;
  startOnBoot: boolean;
  ownerAlertWebhookUrl?: string | null;
  ownerAlertEmail?: string | null;
  discordStatusWebhookUrl?: string | null;
  discordStatusEnabled?: boolean;
  bluemapUrl?: string | null;
  ownerId: string | null;
  ownerUsername: string | null;
  /** True when the current user owns this server (not only a subuser). */
  isOwner?: boolean;
  /**
   * Permissions for the current viewer.
   * `["*"]` = full access (owner/admin). Empty/undefined = no access.
   */
  permissions?: string[];
  /** Daemon node this server runs on */
  nodeId: string | null;
  nodeName: string | null;
  /** Public subdomain label (e.g. lammers → lammers.example.com), if DNS is configured. */
  subdomain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerUpdateInfo {
  serverId: string;
  type: ServerType;
  available: boolean;
  currentMcVersion: string;
  latestMcVersion: string;
  mcUpdateAvailable: boolean;
  channelUpdateAvailable: boolean;
  currentChannelLabel: string | null;
  latestChannelLabel: string | null;
  suggestedMcVersion: string;
  message: string;
}

export interface ServerProperties {
  "server-port"?: string;
  motd?: string;
  "max-players"?: string;
  difficulty?: string;
  gamemode?: string;
  "online-mode"?: string;
  pvp?: string;
  "level-name"?: string;
  "view-distance"?: string;
  "spawn-protection"?: string;
  [key: string]: string | undefined;
}

export interface CreateServerRequest {
  name: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  memoryMb: number;
  /** Disk quota MB (default 10240). */
  diskMb?: number;
  /** CPU % of one core (100 = 1.0). 0 = unlimited. */
  cpuLimit?: number;
  /** Daemon node to place the server on (defaults to local). */
  nodeId?: string;
  /** Optional world defaults applied to server.properties after provision. */
  seed?: string;
  gamemode?: "survival" | "creative" | "adventure" | "spectator";
  difficulty?: "peaceful" | "easy" | "normal" | "hard";
  worldPreset?: "DEFAULT" | "FLAT" | "VOID";
}

export interface UpdateServerRequest {
  name?: string;
  memoryMb?: number;
  diskMb?: number;
  cpuLimit?: number;
  port?: number;
  javaVersion?: string | null;
  startupCommand?: string | null;
  serverJar?: string | null;
  javaPath?: string | null;
  properties?: ServerProperties;
  autoRestart?: boolean;
  startOnBoot?: boolean;
  ownerAlertWebhookUrl?: string | null;
  ownerAlertEmail?: string | null;
  discordStatusWebhookUrl?: string | null;
  discordStatusEnabled?: boolean;
  bluemapUrl?: string | null;
  /** Admin only: reassign server ownership */
  ownerId?: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  /** Max owned servers; null = unlimited. Admins are always unlimited. */
  maxServers: number | null;
  /** Total RAM pool (MB) across owned servers; null = unlimited. */
  maxMemoryMb: number | null;
  /** Max MySQL databases across owned servers; null = unlimited. */
  maxDatabases: number | null;
  serverCount?: number;
  /** Sum of memoryMb on owned servers. */
  memoryUsedMb?: number;
  /** Databases owned via this user's servers. */
  databaseCount?: number;
  /** TOTP two-factor auth is active on this account. */
  twoFactorEnabled?: boolean;
  /** This role must have 2FA (TWO_FACTOR_REQUIRED_ROLES); UI forces setup. */
  twoFactorRequired?: boolean;
}

/** Whether this user may create/import/clone another server under their quota. */
export function canCreateServer(user: AuthUser | null | undefined): boolean {
  if (!user || user.role === "VIEWER") return false;
  if (user.role === "ADMIN" || user.maxServers == null) return true;
  if (user.maxServers <= 0) return false;
  if (user.maxMemoryMb === 0) return false;
  return (user.serverCount ?? 0) < user.maxServers;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: UserRole;
  maxServers?: number | null;
  maxMemoryMb?: number | null;
  maxDatabases?: number | null;
}

export interface UpdateUserRequest {
  password?: string;
  role?: UserRole;
  maxServers?: number | null;
  maxMemoryMb?: number | null;
  maxDatabases?: number | null;
  /** Admin only: wipe the user's TOTP so they can re-enrol. */
  disableTwoFactor?: true;
}

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
  fqdn: string;
  scheme: string;
  daemonPort: number;
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
  status: NodeStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  serverCount: number;
  /** Base URL derived from scheme/fqdn/port */
  publicUrl: string;
}

/** Default MySQL database quota for new non-admin users. */
export const DEFAULT_MAX_DATABASES = 3;

/** @deprecated Use DEFAULT_MAX_DATABASES / per-user maxDatabases */
export const MAX_DATABASES_PER_SERVER = DEFAULT_MAX_DATABASES;

/** @deprecated Use DEFAULT_MAX_DATABASES */
export const MAX_DATABASES_PER_OWNER = DEFAULT_MAX_DATABASES;

/** Stable server DB-user prefix, e.g. `s40903_`. */
export function databaseNamePrefix(serverId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < serverId.length; i++) {
    hash ^= serverId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = 10000 + (Math.abs(hash) % 90000);
  return `s${num}_`;
}

export interface ServerDatabase {
  id: string;
  serverId: string;
  nodeId: string;
  name: string;
  username: string;
  password: string;
  host: string;
  port: number;
  remote: string;
  jdbcUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerDatabasesResponse {
  databases: ServerDatabase[];
  /** Fixed name prefix for this server (`s12345_`). */
  prefix: string;
  /** Owner quota limit; null = unlimited. */
  limit: number | null;
  used: number;
  /** null when unlimited. */
  remaining: number | null;
  /** @deprecated alias of used */
  ownerUsed: number;
  /** @deprecated */
  ownerRemaining: number;
}

export interface CreateNodeRequest {
  name: string;
  fqdn: string;
  scheme?: "http" | "https";
  daemonPort?: number;
  memoryMb?: number;
}

export interface UpdateNodeRequest {
  name?: string;
  fqdn?: string;
  scheme?: "http" | "https";
  daemonPort?: number;
  memoryMb?: number;
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
    version?: import("./version.js").PanelVersionStatus;
  };
  /** @deprecated use panel.api — kept for older clients */
  api: {
    ok: true;
    pid: number;
    uptime: number;
    memoryRssMb: number;
    nodeVersion: string;
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

export type ScheduleStepKind = "command" | "restart" | "backup" | "wait";

export interface ScheduleStep {
  kind: ScheduleStepKind;
  /** Minecraft command without leading slash (command steps). */
  command?: string;
  /** Seconds to sleep (wait steps), 1–3600. */
  delaySeconds?: number;
  /**
   * For command/restart: skip when server is offline (default true).
   * Backup and wait ignore this.
   */
  onlyIfRunning?: boolean;
  /** Continue the chain if this step fails (default false). */
  continueOnFailure?: boolean;
}

export interface ScheduledTask {
  id: string;
  enabled: boolean;
  /**
   * Summary kind for list UI / legacy clients.
   * `"chain"` when there are multiple steps or a backup/wait-only schedule.
   */
  kind: "command" | "restart" | "backup" | "chain";
  /** Cron-like local time HH:mm for daily/weekly, or interval hours when mode is interval */
  mode: "daily" | "interval" | "weekly";
  dailyAt: string;
  intervalHours: number;
  /**
   * Days of week when mode === "weekly" (0 = Sunday … 6 = Saturday, JS `Date.getDay()`).
   * Ignored for daily/interval.
   */
  weekdays: number[];
  /**
   * Legacy single-command field (still filled from the first command step).
   * Prefer `steps` for new clients.
   */
  command: string;
  /** Ordered steps executed sequentially when the schedule fires. */
  steps: ScheduleStep[];
  note: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Last chain failure message, if any. */
  lastError: string | null;
}

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

export interface CloneServerRequest {
  name: string;
  port: number;
  memoryMb?: number;
  diskMb?: number;
  cpuLimit?: number;
  /** Admin only: place the clone on this node. */
  nodeId?: string;
}

export interface TransferServerRequest {
  /** Destination daemon node. */
  nodeId: string;
  /** Keep current ports if free on dest; optional remap of primary only. */
  port?: number;
  /** Start the server on the destination after a successful move. */
  startAfter?: boolean;
}

export interface TransferJobStatus {
  serverId: string;
  step: string;
  steps: string[];
  stepIndex: number;
  error: string | null;
  done: boolean;
  /** True when the job finished successfully. */
  ok: boolean;
  /** 0–100 overall progress (steps + chunked export/deploy). */
  percent: number;
  /** Optional human detail under the current step (e.g. "12 MB / 40 MB"). */
  detail: string | null;
  bytesTransferred?: number | null;
  bytesTotal?: number | null;
}

export interface ImportServerRequest {
  name: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  memoryMb: number;
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

export interface VersionsResponse {
  type: ServerType;
  versions: string[];
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

/** Keys allowed to be edited via the panel (Multicraft-style categories). */
export const EDITABLE_PROPERTY_KEYS = [
  // General
  "motd",
  "max-players",
  "online-mode",
  "enable-status",
  "hide-online-players",
  // World
  "level-name",
  "level-seed",
  "level-type",
  "generator-settings",
  "difficulty",
  "gamemode",
  "hardcore",
  "force-gamemode",
  "generate-structures",
  "allow-nether",
  "max-world-size",
  // Gameplay
  "pvp",
  "allow-flight",
  "spawn-protection",
  "spawn-monsters",
  "spawn-animals",
  "spawn-npcs",
  "enable-command-block",
  "player-idle-timeout",
  // Network / access
  "white-list",
  "enforce-whitelist",
  "prevent-proxy-connections",
  "resource-pack",
  "resource-pack-sha1",
  "resource-pack-prompt",
  "require-resource-pack",
  // Performance
  "view-distance",
  "simulation-distance",
  "network-compression-threshold",
  "max-tick-time",
  "sync-chunk-writes",
] as const;

export type EditablePropertyKey = (typeof EDITABLE_PROPERTY_KEYS)[number];

export * from "./permissions.js";
export * from "./java.js";
export * from "./activity.js";
export * from "./api-keys.js";
export * from "./application-api.js";
export * from "./bytes.js";
export * from "./version.js";

export interface ServerSubUser {
  id: string;
  serverId: string;
  email: string;
  userId: string | null;
  username: string | null;
  permissions: string[];
  /** True when a pending invite token exists. */
  invitePending?: boolean;
  inviteExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubUserRequest {
  email: string;
  permissions: string[];
}

export interface UpdateSubUserRequest {
  permissions: string[];
}

export interface CreateSubUserResponse {
  subuser: ServerSubUser;
  /** True when a new panel account was created (password set via invite email). */
  accountCreated?: boolean;
  /** Absolute invite URL (shown once / on resend). */
  inviteUrl?: string;
}

/** Curated Paper/Purpur plugin stacks (Modrinth project ids). */
export interface PluginStackItem {
  projectId: string;
  slug: string;
  name: string;
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
