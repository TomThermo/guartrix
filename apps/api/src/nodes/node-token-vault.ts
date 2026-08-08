import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const TOKENS_FILE = "node-tokens.json";
const ALGO = "aes-256-gcm";

type VaultFile = {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

function vaultPath(): string {
  return path.join(config.dataDir, TOKENS_FILE);
}

function deriveKey(): Buffer {
  return createHash("sha256").update(config.sessionSecret, "utf8").digest();
}

function encryptJson(payload: Record<string, string>): VaultFile {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function decryptJson(file: VaultFile): Record<string, string> {
  const decipher = createDecipheriv(ALGO, deriveKey(), Buffer.from(file.iv, "base64"));
  decipher.setAuthTag(Buffer.from(file.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(file.ciphertext, "base64")),
    decipher.final(),
  ]);
  const parsed = JSON.parse(decrypted.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/** Load all persisted plaintext node tokens (empty if missing/corrupt). */
export function loadNodeTokenVault(): Record<string, string> {
  try {
    const raw = fs.readFileSync(vaultPath(), "utf8");
    const file = JSON.parse(raw) as VaultFile;
    if (file?.v !== 1 || !file.iv || !file.tag || !file.ciphertext) return {};
    return decryptJson(file);
  } catch {
    return {};
  }
}

/** Atomically persist the full token map (encrypted with SESSION_SECRET). */
export function saveNodeTokenVault(tokens: Record<string, string>): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const payload = encryptJson(tokens);
  const tmp = `${vaultPath()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, vaultPath());
  try {
    fs.chmodSync(vaultPath(), 0o600);
  } catch {
    // ignore
  }
}
