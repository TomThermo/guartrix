import type { FastifyRequest } from "fastify";
import { prisma } from "../../db.js";
import { verifyPassword } from "../password-hash.js";
import { getRateLimitStore } from "../../rate-limit-store.js";

/** Verify the current session user's password (e.g. destructive actions). */
export async function verifySessionPassword(
  request: FastifyRequest,
  password: string,
): Promise<boolean> {
  return verifyAccountPassword(request, password);
}

/**
 * Verify the panel password for the authenticated account (cookie session or
 * Client API key). Used for destructive actions like server delete.
 * Failed attempts are rate-limited per user to slow offline guessing with a stolen gt_ key.
 */
export async function verifyAccountPassword(
  request: FastifyRequest,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const userId = request.session.userId ?? request.apiKeyAuth?.userId;
  if (!userId) return false;

  const store = getRateLimitStore();
  const limitKey = `account-password:${userId}`;
  // 10 attempts / 15 minutes — independent of the global API-key rate limit.
  const hit = await store.hit(limitKey, 15 * 60_000, 10);
  if (hit.limited) return false;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  const ok = await verifyPassword(password, user.passwordHash);
  if (ok) await store.clear(limitKey);
  return ok;
}
