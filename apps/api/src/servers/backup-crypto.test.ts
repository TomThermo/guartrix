import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  decryptBackupArchive,
  encryptBackupArchive,
  isBackupEncryptionEnabled,
  peekBackupEncrypted,
} from "./backup-crypto.js";

const PREV_ENC = process.env.BACKUP_ENCRYPTION;
const PREV_KEY = process.env.BACKUP_ENCRYPTION_KEY;
const PREV_SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  if (PREV_ENC === undefined) delete process.env.BACKUP_ENCRYPTION;
  else process.env.BACKUP_ENCRYPTION = PREV_ENC;
  if (PREV_KEY === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
  else process.env.BACKUP_ENCRYPTION_KEY = PREV_KEY;
  if (PREV_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = PREV_SECRET;
});

describe("backup-crypto", () => {
  it("reports encryption off by default", () => {
    delete process.env.BACKUP_ENCRYPTION;
    expect(isBackupEncryptionEnabled()).toBe(false);
  });

  it("round-trips a tar.gz payload", async () => {
    process.env.BACKUP_ENCRYPTION = "1";
    process.env.SESSION_SECRET = "unit-test-backup-secret-xxxxxx";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gxbk-"));
    try {
      const plain = path.join(dir, "2026.tar.gz");
      const payload = Buffer.from("fake-tar-gz-bytes-for-test-0123456789");
      await fs.writeFile(plain, payload);
      const { encPath, sizeBytes } = await encryptBackupArchive(plain);
      expect(encPath.endsWith(".tar.gz.enc")).toBe(true);
      expect(sizeBytes).toBeGreaterThan(payload.length);
      expect(peekBackupEncrypted(encPath)).toBe(true);
      await expect(fs.access(plain)).rejects.toThrow();

      const out = path.join(dir, "out.tar.gz");
      await decryptBackupArchive(encPath, out);
      expect(await fs.readFile(out)).toEqual(payload);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on wrong key", async () => {
    process.env.BACKUP_ENCRYPTION = "1";
    process.env.SESSION_SECRET = "secret-aaaa-aaaaaaaaaaaa";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gxbk-"));
    try {
      const plain = path.join(dir, "x.tar.gz");
      await fs.writeFile(plain, Buffer.from("hello-backup"));
      const { encPath } = await encryptBackupArchive(plain);
      process.env.SESSION_SECRET = "secret-bbbb-bbbbbbbbbbbb";
      await expect(decryptBackupArchive(encPath, path.join(dir, "bad.tar.gz"))).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
