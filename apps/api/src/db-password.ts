import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encrypt game-server MySQL passwords at rest (AES-256-GCM), keyed from
 * SESSION_SECRET with purpose string `guartrix-db-pass-v1` (same pattern as TOTP).
 * Legacy plaintext rows are accepted on read and re-sealed on next write.
 */

const DB_PASS_ENC_PREFIX = "enc:v1:";

function dbPassSealKey(): Buffer {
  const secret = process.env.SESSION_SECRET?.trim() || "dev-session-secret-change-me";
  return scryptSync(secret, "guartrix-db-pass-v1", 32);
}

export function isSealedDatabasePassword(stored: string): boolean {
  return stored.startsWith(DB_PASS_ENC_PREFIX);
}

/** Encrypt a MySQL password for storage. Idempotent if already sealed. */
export function sealDatabasePassword(plain: string): string {
  if (isSealedDatabasePassword(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dbPassSealKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return DB_PASS_ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Decrypt sealed passwords; pass through legacy plaintext. */
export function unsealDatabasePassword(stored: string): string {
  if (!isSealedDatabasePassword(stored)) return stored;
  const raw = Buffer.from(stored.slice(DB_PASS_ENC_PREFIX.length), "base64url");
  if (raw.length < 28) throw new Error("Corrupt database password");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", dbPassSealKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
