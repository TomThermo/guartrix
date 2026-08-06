import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  BackupUploadInitResponse,
  BackupUploadStatusResponse,
  ServerBackup,
} from "@msm/shared";
import {
  BACKUP_TRANSFER_CHUNK_BYTES,
  BACKUP_UPLOAD_MAX_BYTES,
} from "@msm/shared";
import { serverBackupsDir } from "../config.js";
import {
  finalizeUploadedBackup,
  formatBackupSize,
} from "./backups.js";

interface UploadMeta {
  uploadId: string;
  serverId: string;
  backupId: string;
  fileName: string;
  note: string | null;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  createdAt: string;
  received: number[]; // chunk indices that landed
}

function uploadsRoot(serverId: string): string {
  return path.join(serverBackupsDir(serverId), ".uploads");
}

/** Chunked-upload session ids are nanoid — never path segments. */
export function assertSafeUploadId(uploadId: string): void {
  if (!uploadId || !/^[A-Za-z0-9_-]{8,64}$/.test(uploadId) || uploadId.includes("..")) {
    throw new Error("Invalid upload id");
  }
}

function sessionDir(serverId: string, uploadId: string): string {
  assertSafeUploadId(uploadId);
  const root = path.resolve(uploadsRoot(serverId));
  const dir = path.resolve(path.join(root, uploadId));
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    throw new Error("Invalid upload id");
  }
  return dir;
}

function metaPath(serverId: string, uploadId: string): string {
  return path.join(sessionDir(serverId, uploadId), "meta.json");
}

function chunkPath(serverId: string, uploadId: string, index: number): string {
  return path.join(sessionDir(serverId, uploadId), `c${index}`);
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^\w.\-]+/g, "_");
}

export function assertBackupArchiveName(fileName: string): void {
  const lower = fileName.toLowerCase();
  if (
    !lower.endsWith(".tar.gz") &&
    !lower.endsWith(".tgz") &&
    !lower.endsWith(".zip")
  ) {
    throw new Error("Backup upload must be a .tar.gz, .tgz or .zip file");
  }
}

export function getBackupTransferLimits() {
  return {
    maxBytes: BACKUP_UPLOAD_MAX_BYTES,
    chunkSize: BACKUP_TRANSFER_CHUNK_BYTES,
  };
}

async function readMeta(
  serverId: string,
  uploadId: string,
): Promise<UploadMeta> {
  const raw = await fs.readFile(metaPath(serverId, uploadId), "utf8");
  return JSON.parse(raw) as UploadMeta;
}

async function writeMeta(meta: UploadMeta): Promise<void> {
  const tmp = `${metaPath(meta.serverId, meta.uploadId)}.tmp`;
  const dest = metaPath(meta.serverId, meta.uploadId);
  await fs.writeFile(tmp, JSON.stringify(meta), "utf8");
  await fs.rename(tmp, dest);
}

async function listReceivedChunks(
  serverId: string,
  uploadId: string,
  totalChunks: number,
): Promise<number[]> {
  const dir = sessionDir(serverId, uploadId);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const name of names) {
    const m = /^c(\d+)$/.exec(name);
    if (!m) continue;
    const idx = Number(m[1]);
    if (Number.isInteger(idx) && idx >= 0 && idx < totalChunks) out.push(idx);
  }
  return out.sort((a, b) => a - b);
}

export async function initChunkedUpload(opts: {
  serverId: string;
  fileName: string;
  sizeBytes: number;
  note?: string | null;
}): Promise<BackupUploadInitResponse> {
  const fileName = sanitizeFileName(opts.fileName || "backup.tar.gz");
  assertBackupArchiveName(fileName);

  const sizeBytes = Math.floor(Number(opts.sizeBytes));
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Invalid file size");
  }
  if (sizeBytes > BACKUP_UPLOAD_MAX_BYTES) {
    throw new Error(
      `Backup too large (max ${formatBackupSize(BACKUP_UPLOAD_MAX_BYTES)})`,
    );
  }

  const chunkSize = BACKUP_TRANSFER_CHUNK_BYTES;
  const totalChunks = Math.ceil(sizeBytes / chunkSize);
  const uploadId = nanoid(16);
  const createdAt = new Date();
  const backupId = `upload-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
  const note = opts.note?.trim() ? opts.note.trim().slice(0, 120) : null;

  const dir = sessionDir(opts.serverId, uploadId);
  await fs.mkdir(dir, { recursive: true });

  const meta: UploadMeta = {
    uploadId,
    serverId: opts.serverId,
    backupId,
    fileName,
    note,
    sizeBytes,
    chunkSize,
    totalChunks,
    createdAt: createdAt.toISOString(),
    received: [],
  };
  await writeMeta(meta);

  return {
    uploadId,
    backupId,
    chunkSize,
    totalChunks,
    maxBytes: BACKUP_UPLOAD_MAX_BYTES,
  };
}

export async function getChunkedUploadStatus(
  serverId: string,
  uploadId: string,
): Promise<BackupUploadStatusResponse> {
  const meta = await readMeta(serverId, uploadId);
  if (meta.serverId !== serverId) throw new Error("Upload not found");
  const receivedChunks = await listReceivedChunks(
    serverId,
    uploadId,
    meta.totalChunks,
  );
  let receivedBytes = 0;
  for (const idx of receivedChunks) {
    const st = await fs.stat(chunkPath(serverId, uploadId, idx));
    receivedBytes += st.size;
  }
  return {
    uploadId: meta.uploadId,
    backupId: meta.backupId,
    sizeBytes: meta.sizeBytes,
    chunkSize: meta.chunkSize,
    totalChunks: meta.totalChunks,
    receivedChunks,
    receivedBytes,
  };
}

export async function saveUploadChunk(opts: {
  serverId: string;
  uploadId: string;
  index: number;
  data: Buffer;
}): Promise<{ index: number; receivedBytes: number; totalChunks: number }> {
  const meta = await readMeta(opts.serverId, opts.uploadId);
  if (meta.serverId !== opts.serverId) throw new Error("Upload not found");

  const index = Math.floor(Number(opts.index));
  if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
    throw new Error(`Invalid chunk index ${opts.index}`);
  }

  const expected =
    index === meta.totalChunks - 1
      ? meta.sizeBytes - meta.chunkSize * (meta.totalChunks - 1)
      : meta.chunkSize;
  if (opts.data.length !== expected) {
    throw new Error(
      `Chunk ${index} size mismatch: expected ${expected}, got ${opts.data.length}`,
    );
  }

  const dest = chunkPath(opts.serverId, opts.uploadId, index);
  const tmp = `${dest}.${process.pid}.tmp`;
  await fs.writeFile(tmp, opts.data);
  await fs.rename(tmp, dest);

  const receivedChunks = await listReceivedChunks(
    opts.serverId,
    opts.uploadId,
    meta.totalChunks,
  );
  let receivedBytes = 0;
  for (const idx of receivedChunks) {
    receivedBytes +=
      idx === meta.totalChunks - 1
        ? meta.sizeBytes - meta.chunkSize * (meta.totalChunks - 1)
        : meta.chunkSize;
  }

  return {
    index,
    receivedBytes,
    totalChunks: meta.totalChunks,
  };
}

export async function completeChunkedUpload(opts: {
  serverId: string;
  uploadId: string;
}): Promise<ServerBackup> {
  const meta = await readMeta(opts.serverId, opts.uploadId);
  if (meta.serverId !== opts.serverId) throw new Error("Upload not found");

  const received = await listReceivedChunks(
    opts.serverId,
    opts.uploadId,
    meta.totalChunks,
  );
  if (received.length !== meta.totalChunks) {
    throw new Error(
      `Upload incomplete: ${received.length}/${meta.totalChunks} chunks`,
    );
  }
  for (let i = 0; i < meta.totalChunks; i++) {
    if (received[i] !== i) {
      throw new Error(`Missing chunk ${i}`);
    }
  }

  const partialPath = path.join(
    sessionDir(opts.serverId, opts.uploadId),
    "assembled.partial",
  );
  const fh = await fs.open(partialPath, "w");
  try {
    for (let i = 0; i < meta.totalChunks; i++) {
      const buf = await fs.readFile(chunkPath(opts.serverId, opts.uploadId, i));
      await fh.write(buf);
    }
  } catch (err) {
    await fh.close().catch(() => undefined);
    await fs.rm(partialPath, { force: true }).catch(() => undefined);
    throw err;
  }
  await fh.close();

  const st = await fs.stat(partialPath);
  if (st.size !== meta.sizeBytes) {
    await fs.rm(partialPath, { force: true }).catch(() => undefined);
    throw new Error(
      `Assembled size mismatch: expected ${meta.sizeBytes}, got ${st.size}`,
    );
  }

  try {
    const backup = await finalizeUploadedBackup({
      serverId: opts.serverId,
      backupId: meta.backupId,
      partialPath,
      sizeBytes: st.size,
      note: meta.note,
      createdAt: meta.createdAt,
      originalName: meta.fileName,
    });
    await fs
      .rm(sessionDir(opts.serverId, opts.uploadId), {
        recursive: true,
        force: true,
      })
      .catch(() => undefined);
    return backup;
  } catch (err) {
    await fs.rm(partialPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function abortChunkedUpload(
  serverId: string,
  uploadId: string,
): Promise<void> {
  await fs
    .rm(sessionDir(serverId, uploadId), { recursive: true, force: true })
    .catch(() => undefined);
}
