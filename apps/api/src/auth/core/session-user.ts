import type { FastifyRequest } from "fastify";
import type { AuthUser } from "@msm/shared";
import { resolveApiKeyAuth } from "../api-keys.js";
import { prisma } from "../../db.js";
import { toAuthUser } from "./users.js";
import "./session-types.js";

export function isAuthenticated(request: FastifyRequest): boolean {
  return Boolean((request.session.authenticated && request.session.userId) || request.apiKeyAuth);
}

async function loadAuthUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (user.role === "ADMIN") {
    return toAuthUser(user);
  }
  const servers = await prisma.server.findMany({
    where: { ownerId: user.id },
    select: { memoryMb: true },
  });
  const databaseCount = await prisma.database.count({
    where: { server: { ownerId: user.id } },
  });
  return toAuthUser(user, {
    serverCount: servers.length,
    memoryUsedMb: servers.reduce((sum, s) => sum + s.memoryMb, 0),
    databaseCount,
  });
}

/**
 * Resolve the acting user from a cookie session or a personal API key
 * (`Authorization: Bearer gt_…`). Daemon Bearer tokens are not handled here.
 * Result is cached on the request for the rest of the hook/handler chain.
 */
export async function getSessionUser(request: FastifyRequest): Promise<AuthUser | null> {
  if (request.authUserCacheLoaded) {
    return request.authUserCache ?? null;
  }

  let user: AuthUser | null = null;
  if (request.session.authenticated && request.session.userId) {
    user = await loadAuthUserById(request.session.userId);
  } else if (request.apiKeyAuth) {
    user = await loadAuthUserById(request.apiKeyAuth.userId);
  } else {
    const resolved = await resolveApiKeyAuth(request);
    if (resolved) user = await loadAuthUserById(resolved.userId);
  }

  request.authUserCache = user;
  request.authUserCacheLoaded = true;
  return user;
}

export function canWriteRole(user: AuthUser): boolean {
  return user.role === "ADMIN" || user.role === "OPERATOR";
}
