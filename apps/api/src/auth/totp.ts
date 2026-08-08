import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";

/**
 * Minimal TOTP (RFC 6238, HMAC-SHA1, 6 digits, 30s step) — the profile every
 * authenticator app supports. Implemented on node:crypto so the panel does not
 * pull in an OTP dependency.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous/next step too (clock drift on phones). */
const VERIFY_WINDOW = 1;
const TOTP_ENC_PREFIX = "enc:v1:";

function totpSealKey(): Buffer {
  const secret = process.env.SESSION_SECRET?.trim() || "dev-session-secret-change-me";
  return scryptSync(secret, "guartrix-totp-v1", 32);
}

/** Encrypt a TOTP secret at rest (AES-256-GCM). Plain base32 still accepted on read. */
export function sealTotpSecret(plainBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", totpSealKey(), iv);
  const enc = Buffer.concat([cipher.update(plainBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return TOTP_ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Decrypt sealed secrets; pass through legacy plaintext base32. */
export function unsealTotpSecret(stored: string): string {
  if (!stored.startsWith(TOTP_ENC_PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(TOTP_ENC_PREFIX.length), "base64url");
  if (raw.length < 28) throw new Error("Corrupt TOTP secret");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", totpSealKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** New 160-bit secret, base32 for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(msg).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function verifyTotp(secretBase32: string, code: string, now = Date.now()): boolean {
  const normalized = code.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  let plain: string;
  try {
    plain = unsealTotpSecret(secretBase32);
  } catch {
    return false;
  }
  const secret = base32Decode(plain);
  if (secret.length === 0) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  const given = Buffer.from(normalized);
  for (let offset = -VERIFY_WINDOW; offset <= VERIFY_WINDOW; offset += 1) {
    const expected = Buffer.from(hotp(secret, counter + offset));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl(username: string, secretBase32: string): string {
  const plain = unsealTotpSecret(secretBase32);
  const issuer = "Guartrix";
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    secret: plain,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Recovery codes shown once; only sha256 hashes are stored. */
export function generateRecoveryCodes(count = 8): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/[\s-]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

/** Parse the stored JSON array of recovery-code hashes. */
export function parseRecoveryCodes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Check a recovery code against the stored hashes. Returns the remaining
 * hashes with the used one consumed, or null when the code does not match.
 */
export function consumeRecoveryCode(raw: string | null, code: string): string[] | null {
  const hashes = parseRecoveryCodes(raw);
  const hash = hashRecoveryCode(code);
  const index = hashes.indexOf(hash);
  if (index === -1) return null;
  return [...hashes.slice(0, index), ...hashes.slice(index + 1)];
}
