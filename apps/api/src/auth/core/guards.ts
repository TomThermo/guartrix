import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import type { AuthUser, ServerPermission } from "@msm/shared";
import { adminPanelHasScope, hasPermission, type AdminPanelScope } from "@msm/shared";
import { apiKeyAllowsServer, apiKeyRateLimitedMessage, intersectPermissions } from "../api-keys.js";
import { prisma } from "../../db.js";
import {
  getServerPermissions,
  isServerOwner,
  permissionDeniedMessage,
  userCanAccessServer,
} from "../../servers/server-access.js";
import { canWriteRole, getSessionUser } from "./session-user.js";

/** Load a server and enforce ownership / subuser access (+ optional permission). */
export async function requireServerAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  opts?: {
    write?: boolean;
    permission?: ServerPermission | ServerPermission[];
    /** Owner/admin only (e.g. delete server, transfer). */
    ownerOnly?: boolean;
  },
): Promise<{ user: AuthUser; server: Server; permissions: string[] } | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    await reply.status(404).send({ error: "Not found" });
    return null;
  }

  if (server.nodeId && user.role !== "ADMIN") {
    const node = await prisma.node.findUnique({
      where: { id: server.nodeId },
      select: { maintenanceMode: true, name: true },
    });
    if (node?.maintenanceMode) {
      await reply.status(503).send({
        error: `Node "${node.name}" is under maintenance`,
        code: "NODE_MAINTENANCE",
      });
      return null;
    }
  }

  const allowed = await userCanAccessServer(user, server);
  if (!allowed) {
    await reply.status(404).send({ error: "Not found" });
    return null;
  }

  if (!apiKeyAllowsServer(request.apiKeyAuth, server.id)) {
    await reply.status(404).send({ error: "Not found" });
    return null;
  }

  if (opts?.ownerOnly && !isServerOwner(user, server)) {
    await reply.status(403).send({ error: "Only the server owner can do this" });
    return null;
  }

  let permissions = await getServerPermissions(user, server);
  if (request.apiKeyAuth) {
    permissions = intersectPermissions(permissions, request.apiKeyAuth.permissions);
  }

  if (opts?.permission) {
    const need = opts.permission;
    const ok = hasPermission(permissions, need);
    if (!ok) {
      await reply.status(403).send({
        error: permissionDeniedMessage(user, server, permissions),
      });
      return null;
    }
  } else if (opts?.write) {
    // Legacy write flag: owners/admins always; subusers need at least one mutating perm
    // Prefer explicit `permission` on new routes.
    if (!isServerOwner(user, server) && user.role === "VIEWER") {
      await reply.status(403).send({ error: "You cannot modify this server" });
      return null;
    }
    if (!isServerOwner(user, server) && permissions.length === 0) {
      await reply.status(403).send({ error: "You cannot modify this server" });
      return null;
    }
    // API key with empty intersect also blocked.
    if (request.apiKeyAuth && permissions.length === 0) {
      await reply.status(403).send({ error: "Missing permission" });
      return null;
    }
  }

  return { user, server, permissions };
}

/** Guard all /api/servers/:serverId/* routes by ownership or subuser access. */
export function registerOwnershipGuard(app: FastifyInstance): void {
  const collection = new Set(["stats", "online", "updates", "addon-updates", "import"]);

  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.startsWith("/api/servers/")) return;

    const segment = pathOnly.slice("/api/servers/".length).split("/")[0] ?? "";
    if (!segment || collection.has(segment)) return;

    const user = await getSessionUser(request);
    if (!user) return; // route handler sends 401

    if (!apiKeyAllowsServer(request.apiKeyAuth, segment)) {
      return reply.status(404).send({ error: "Not found" });
    }

    const server = await prisma.server.findUnique({ where: { id: segment } });
    if (!server) {
      return reply.status(404).send({ error: "Not found" });
    }
    if (!(await userCanAccessServer(user, server))) {
      return reply.status(404).send({ error: "Not found" });
    }
  });
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await getSessionUser(request);
  if (!user) {
    const rateMsg = apiKeyRateLimitedMessage(request);
    if (rateMsg) {
      const { rateLimitedError } = await import("../../http-error.js");
      await reply.status(429).send(rateLimitedError(rateMsg));
      return null;
    }
    await reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return null;
  }
  return user;
}

/** Cookie session only — used for API-key management (keys cannot mint keys). */
export async function requireSessionAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  if (!(request.session.authenticated && request.session.userId)) {
    await reply.status(401).send({ error: "Sign in with the panel to manage API keys" });
    return null;
  }
  return requireAuth(request, reply);
}

export async function requireWrite(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (!canWriteRole(user)) {
    await reply.status(403).send({ error: "Viewers cannot change servers" });
    return null;
  }
  return user;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  scope?: AdminPanelScope,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (user.role !== "ADMIN") {
    await reply.status(403).send({ error: "Admin only" });
    return null;
  }
  if (request.apiKeyAuth) {
    const scopes = request.apiKeyAuth.adminScopes ?? [];
    if (scopes.length === 0) {
      await reply.status(403).send({
        error:
          "This API key has no panel admin scopes. Add adminScopes when creating the key, or use server routes only.",
      });
      return null;
    }
    const needed = scope ?? "admin.full";
    if (!adminPanelHasScope(scopes, needed)) {
      await reply.status(403).send({ error: `Missing admin scope: ${needed}` });
      return null;
    }
  }
  return user;
}

/**
 * Client API keys with only granular scopes (e.g. users.write) must not mint or
 * promote ADMIN accounts — that needs admin.full / *. Cookie sessions of an
 * ADMIN are unrestricted (same as the UI Users page).
 */
export function assertCanAssignAdminRole(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.apiKeyAuth) return true;
  if (adminPanelHasScope(request.apiKeyAuth.adminScopes ?? [], "admin.full")) {
    return true;
  }
  void reply.status(403).send({
    error: "Creating or promoting ADMIN accounts requires admin.full (or *) on the API key",
  });
  return false;
}

/**
 * Privileged panel ops that historically checked `role === "ADMIN"` only.
 * Cookie admins pass; Client API keys need admin.full so scoped keys cannot
 * reassign ownership / change memory / transfer nodes via CSRF+Bearer mix.
 */
export function assertAdminFullApiKey(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.apiKeyAuth) return true;
  if (adminPanelHasScope(request.apiKeyAuth.adminScopes ?? [], "admin.full")) {
    return true;
  }
  void reply.status(403).send({ error: "Missing admin scope: admin.full" });
  return false;
}
