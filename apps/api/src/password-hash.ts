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

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64, SCRYPT_OPTS).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64, SCRYPT_OPTS);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}
