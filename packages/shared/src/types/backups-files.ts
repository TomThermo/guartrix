export type BackupScheduleMode = "off" | "interval" | "daily" | "cron";

export interface BackupSchedule {
  mode: BackupScheduleMode;
  /** Used when mode === "interval" (1–168). */
  intervalHours: number;
  /** Local server time HH:mm when mode === "daily". */
  dailyAt: string;
  /** Standard 5-field cron when mode === "cron". */
  cronExpression: string;
  /** How many backups to keep (1–50). */
  keepCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/** Preset options shown in backup retention dropdowns (API allows 1–50). */
export const BACKUP_KEEP_COUNT_PRESETS = [3, 5, 7, 10, 14, 20, 30] as const;

export const BACKUP_KEEP_COUNT_MIN = 1;

export const BACKUP_KEEP_COUNT_MAX = 50;

export function clampBackupKeepCount(value: unknown, fallback = 7): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(BACKUP_KEEP_COUNT_MAX, Math.max(BACKUP_KEEP_COUNT_MIN, Math.floor(n)));
}

export interface AdminServerBackupRow {
  id: string;
  name: string;
  ownerUsername: string;
  keepCount: number;
  backupCount: number;
  scheduleMode: BackupScheduleMode;
}

/** Admin → Servers table row (quotas, owner, suspend, backups). */
export interface AdminServerRow {
  id: string;
  name: string;
  ownerId: string | null;
  ownerUsername: string;
  nodeId: string | null;
  nodeName: string | null;
  status: string;
  type: string;
  mcVersion: string;
  port: number;
  memoryMb: number;
  diskMb: number;
  cpuLimit: number;
  suspended: boolean;
  keepCount: number;
  backupCount: number;
  scheduleMode: BackupScheduleMode;
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

/** Max size for File Manager uploads (2 GiB; streamed via temp, not buffered in RAM). */
export const FILE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
