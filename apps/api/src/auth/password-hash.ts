import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Explicit Node scrypt defaults (N=16384, r=8, p=1) so cost is documented
 * and stable. maxmem is raised slightly above Node's 32 MiB default; N/r/p
 * match historical hashes so verifyPassword stays compatible.
 */
const SCRYPT_OPTS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

const HASH_PREFIX = "scrypt$v1";

function scryptHex(
  password: string,
  salt: string,
  opts: { N: number; r: number; p: number; maxmem?: number },
): Buffer {
  return scryptSync(password, salt, 64, {
    N: opts.N,
    r: opts.r,
    p: opts.p,
    maxmem: opts.maxmem ?? 64 * 1024 * 1024,
  });
}

/** New hashes: `scrypt$v1$N$r$p$salt$hash` (hex salt + hash). */
export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptHex(password, s, SCRYPT_OPTS).toString("hex");
  return `${HASH_PREFIX}$${SCRYPT_OPTS.N}$${SCRYPT_OPTS.r}$${SCRYPT_OPTS.p}$${s}$${hash}`;
}

/**
 * Precomputed scrypt hash for login/SFTP timing equalization.
 * Fixed salt so unknown-user paths cost one verify, not hash+verify.
 */
export const TIMING_DUMMY_HASH = hashPassword("timing-dummy", "00000000000000000000000000000000");

/**
 * Accepts versioned `scrypt$v1$…` and legacy `salt:hash` (colon-separated hex).
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith(`${HASH_PREFIX}$`)) {
    const parts = stored.split("$");
    // scrypt, v1, N, r, p, salt, hash
    if (parts.length !== 7) return false;
    const N = Number(parts[2]);
    const r = Number(parts[3]);
    const p = Number(parts[4]);
    const salt = parts[5];
    const hash = parts[6];
    if (!salt || !hash || !Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return false;
    }
    if (N < 2 || r < 1 || p < 1) return false;
    try {
      const next = scryptHex(password, salt, { N, r, p });
      const prev = Buffer.from(hash, "hex");
      if (prev.length !== next.length) return false;
      return timingSafeEqual(prev, next);
    } catch {
      return false;
    }
  }

  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const next = scryptHex(password, salt, SCRYPT_OPTS);
    const prev = Buffer.from(hash, "hex");
    if (prev.length !== next.length) return false;
    return timingSafeEqual(prev, next);
  } catch {
    return false;
  }
}

/** True when the stored hash should be rewritten with {@link hashPassword}. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`${HASH_PREFIX}$`);
}
