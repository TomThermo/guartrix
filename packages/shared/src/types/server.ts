export type ServerType =
  | "VANILLA"
  | "PAPER"
  | "FABRIC"
  | "FORGE"
  | "PURPUR"
  | "NEOFORGE"
  | "QUILT"
  /** Mojang Bedrock Dedicated Server (stable). */
  | "BEDROCK"
  /** Mojang Bedrock Dedicated Server (preview). */
  | "BEDROCK_PREVIEW"
  /** PocketMine-MP (PHP, custom Bedrock server). */
  | "POCKETMINE"
  /** Nukkit (Java, custom Bedrock protocol server). */
  | "NUKKIT";

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
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
];

export type ServerStatus =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "ERROR"
  | "CREATING"
  | "TRANSFERRING";

/** Extra Docker bind: host directory mounted into the server container. */
export interface ServerExtraMount {
  host: string; // absolute host path
  container: string; // absolute container path, must start with /
  readOnly?: boolean;
}

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
  fabricLoaderVersion: string | null;
  forgeVersion: string | null;
  paperBuild: number | null;
  errorMessage: string | null;
  hasIcon: boolean;
  /** From server.properties white-list */
  whitelistEnabled: boolean;
  autoRestart: boolean;
  startOnBoot: boolean;
  /** True after the user stopped/killed the server; cleared on start/restart. */
  stoppedByUser: boolean;
  /** Billing/admin suspend — blocks start/restart until cleared. */
  suspended: boolean;
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
  /** Extra host directories bound into the container (apply on next start/restart). */
  extraMounts?: ServerExtraMount[] | null;
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
  /** Max backups to retain for this server (1–50; panel default when omitted). */
  keepCount?: number;
  /** Extra host directories bound into the container (max 8). */
  extraMounts?: ServerExtraMount[] | null;
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
  properties?: ServerProperties;
  autoRestart?: boolean;
  startOnBoot?: boolean;
  ownerAlertWebhookUrl?: string | null;
  ownerAlertEmail?: string | null;
  discordStatusWebhookUrl?: string | null;
  discordStatusEnabled?: boolean;
  bluemapUrl?: string | null;
  /** Extra host directories bound into the container (max 8). */
  extraMounts?: ServerExtraMount[] | null;
  /** Admin only: reassign server ownership */
  ownerId?: string | null;
  /** Admin only: billing / abuse lockout (stops server when set true) */
  suspended?: boolean;
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

export interface VersionsResponse {
  type: ServerType;
  versions: string[];
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
