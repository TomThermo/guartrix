import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Optional at-rest encryption for server backup archives (AES-256-GCM).
 *
 * Enable with BACKUP_ENCRYPTION=1. Key from BACKUP_ENCRYPTION_KEY (passphrase
 * or 64-char hex / base64 32-byte key), else derived from SESSION_SECRET with
 * purpose salt `guartrix-backup-v1`.
 *
 * File layout: magic "GXBK1" (5) + iv (12) + ciphertext + tag (16).
 */

export const BACKUP_ENC_MAGIC = Buffer.from("GXBK1");
export const BACKUP_ENC_EXT = ".tar.gz.enc";
const HEADER_LEN = 5 + 12;
const TAG_LEN = 16;

export function isBackupEncryptionEnabled(): boolean {
  const v = process.env.BACKUP_ENCRYPTION?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function backupSealKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    try {
      const b64 = Buffer.from(raw, "base64");
      if (b64.length === 32) return b64;
    } catch {
      // fall through
    }
    return scryptSync(raw, "guartrix-backup-v1", 32);
  }
  const secret =
    process.env.SESSION_SECRET?.trim() || "dev-session-secret-change-me";
  return scryptSync(secret, "guartrix-backup-v1", 32);
}

export function isEncryptedBackupPath(filePath: string): boolean {
  return filePath.endsWith(BACKUP_ENC_EXT);
}

export function encryptedArchivePath(plainTarGzPath: string): string {
  if (plainTarGzPath.endsWith(BACKUP_ENC_EXT)) return plainTarGzPath;
  if (plainTarGzPath.endsWith(".tar.gz")) {
    return `${plainTarGzPath.slice(0, -".tar.gz".length)}${BACKUP_ENC_EXT}`;
  }
  return `${plainTarGzPath}${BACKUP_ENC_EXT}`;
}

/** Encrypt plaintext .tar.gz → .tar.gz.enc, delete plaintext. */
export async function encryptBackupArchive(plainPath: string): Promise<{
  encPath: string;
  sizeBytes: number;
}> {
  const encPath = encryptedArchivePath(plainPath);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupSealKey(), iv);
  const tmp = `${encPath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.mkdir(path.dirname(encPath), { recursive: true });

  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  out.write(BACKUP_ENC_MAGIC);
  out.write(iv);

  const transform = new Transform({
    transform(chunk, _enc, cb) {
      try {
        cb(null, cipher.update(chunk as Buffer));
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      try {
        const final = cipher.final();
        const tag = cipher.getAuthTag();
        this.push(final);
        this.push(tag);
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });

  await pipeline(fs.createReadStream(plainPath), transform, out);
  await fsp.rename(tmp, encPath);
  await fsp.rm(plainPath, { force: true }).catch(() => undefined);
  const st = await fsp.stat(encPath);
  return { encPath, sizeBytes: st.size };
}

/** Decrypt .tar.gz.enc to a plaintext temp .tar.gz path (caller deletes). */
export async function decryptBackupArchive(
  encPath: string,
  plainOutPath: string,
): Promise<void> {
  const st = await fsp.stat(encPath);
  if (st.size < HEADER_LEN + TAG_LEN) {
    throw new Error("Corrupt encrypted backup (file too small)");
  }

  const fh = await fsp.open(encPath, "r");
  try {
    const header = Buffer.alloc(HEADER_LEN);
    await fh.read(header, 0, HEADER_LEN, 0);
    if (!header.subarray(0, 5).equals(BACKUP_ENC_MAGIC)) {
      throw new Error("Not a Guartrix encrypted backup (bad magic)");
    }
    const iv = header.subarray(5, 17);
    const tag = Buffer.alloc(TAG_LEN);
    await fh.read(tag, 0, TAG_LEN, st.size - TAG_LEN);

    const decipher = createDecipheriv("aes-256-gcm", backupSealKey(), iv);
    decipher.setAuthTag(tag);

    const cipherEnd = st.size - TAG_LEN;
    const input = fh.createReadStream({ start: HEADER_LEN, end: cipherEnd - 1 });
    const transform = new Transform({
      transform(chunk, _enc, cb) {
        try {
          cb(null, decipher.update(chunk as Buffer));
        } catch (err) {
          cb(err as Error);
        }
      },
      flush(cb) {
        try {
          cb(null, decipher.final());
        } catch (err) {
          cb(err as Error);
        }
      },
    });
    await pipeline(
      input,
      transform,
      fs.createWriteStream(plainOutPath, { mode: 0o600 }),
    );
  } finally {
    await fh.close().catch(() => undefined);
  }
}

/** Fingerprint of the active key for operator diagnostics (not secret). */
export function backupEncryptionKeyFingerprint(): string | null {
  if (!isBackupEncryptionEnabled()) return null;
  return createHash("sha256").update(backupSealKey()).digest("hex").slice(0, 12);
}

export function peekBackupEncrypted(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(5);
      const n = fs.readSync(fd, buf, 0, 5, 0);
      return n === 5 && buf.equals(BACKUP_ENC_MAGIC);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return isEncryptedBackupPath(filePath);
  }
}
