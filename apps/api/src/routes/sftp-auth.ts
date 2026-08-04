import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPermission } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { verifyPassword } from "../auth/auth.js";
import { prisma } from "../db.js";
import { findNodeByDaemonToken } from "../nodes.js";
import { getNodeToken } from "../daemon-client.js";
import {
  daemonJwtLegacyBearerEnabled,
  looksLikeJwt,
  verifyDaemonJwt,
} from "@msm/shared/daemon-jwt";
import { verifyUserAppPassword } from "./app-passwords.js";
import {
  getServerPermissions,
} from "../server-access.js";
import { getRateLimitStore } from "../rate-limit-store.js";

const authBodySchema = z.object({
  username: z.string().min(1).max(64),
  serverId: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const SFTP_AUTH_RATE_WINDOW_MS = 60_000;
const SFTP_AUTH_RATE_MAX = 30;

function rateLimitKey(nodeId: string, username: string): string {
  return `sftp:${nodeId}:${username.toLowerCase()}`;
}

async function checkRateLimit(key: string): Promise<boolean> {
  const result = await getRateLimitStore().hit(
    key,
    SFTP_AUTH_RATE_WINDOW_MS,
    SFTP_AUTH_RATE_MAX,
  );
  return !result.limited;
}

async function resolveDaemonNodeFromBearer(token: string) {
  if (looksLikeJwt(token)) {
    const peek = token.split(".")[1];
    if (!peek) return null;
    let nid: string | null = null;
    try {
      const pad = peek.length % 4 === 0 ? "" : "=".repeat(4 - (peek.length % 4));
      const json = Buffer.from(
        peek.replace(/-/g, "+").replace(/_/g, "/") + pad,
        "base64",
      ).toString("utf8");
      const payload = JSON.parse(json) as { nid?: string };
      nid = typeof payload.nid === "string" ? payload.nid : null;
    } catch {
      return null;
    }
    if (!nid) return null;
    const secret = getNodeToken(nid);
    if (!secret) return null;
    const claims = verifyDaemonJwt(token, secret, {
      aud: "panel",
      nodeId: nid,
    });
    if (!claims) return null;
    return prisma.node.findUnique({ where: { id: nid } });
  }
  if (!daemonJwtLegacyBearerEnabled()) return null;
  console.warn(
    "[sftp-auth] legacy daemon bearer accepted (DAEMON_JWT_LEGACY=true) — migrate nodes to JWT and set DAEMON_JWT_LEGACY=false",
  );
  return findNodeByDaemonToken(token);
}

/**
 * Internal endpoint called by node daemons during SFTP password auth.
 * Authorization: Bearer <daemon JWT or legacy long-lived token>
 */
export function registerSftpAuthRoutes(app: FastifyInstance): void {
  app.post("/api/internal/sftp-auth", async (request, reply) => {
    const header = request.headers.authorization;
    const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
    const token = match?.[1]?.trim();
    if (!token) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const node = await resolveDaemonNodeFromBearer(token);
    if (!node) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const parsed = authBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Invalid body" });
    }

    const { username, serverId, password } = parsed.data;
    if (!(await checkRateLimit(rateLimitKey(node.id, username)))) {
      return reply.status(429).send({ ok: false, error: "Too many attempts" });
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server || server.nodeId !== node.id) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const user = await prisma.$queryRaw<
      Array<{ id: string; username: string; passwordHash: string; role: string }>
    >`
      SELECT id, username, passwordHash, role FROM User
      WHERE LOWER(username) = LOWER(${username})
      LIMIT 1
    `.then(async (rows) => {
      const id = rows[0]?.id;
      if (!id) return null;
      return prisma.user.findUnique({ where: { id } });
    });

    if (
      !user ||
      (!verifyPassword(password, user.passwordHash) &&
        !(await verifyUserAppPassword(user.id, password)))
    ) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const authUser = {
      id: user.id,
      username: user.username,
      role: user.role as "ADMIN" | "OPERATOR" | "VIEWER",
      createdAt: user.createdAt.toISOString(),
      maxServers: user.maxServers ?? null,
      maxMemoryMb: user.maxMemoryMb ?? null,
      maxDatabases: user.maxDatabases ?? null,
    };

    const permissions = await getServerPermissions(authUser, server);
    const allowed = hasPermission(permissions, "file.sftp");

    if (!allowed) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const canUpload = hasPermission(permissions, "file.upload");
    const canUpdate = hasPermission(permissions, "file.update");
    const canCreate = hasPermission(permissions, "file.create");
    const canDelete = hasPermission(permissions, "file.delete");
    // Backward-compat flag for older daemons (any mutating file op).
    const writable = canUpload || canUpdate || canCreate || canDelete;

    logActivity({
      action: "file.sftp-login",
      user: { id: user.id, username: user.username },
      server,
      metadata: { node: node.name, writable },
    });

    return {
      ok: true,
      serverId: server.id,
      writable,
      canUpload,
      canUpdate,
      canCreate,
      canDelete,
    };
  });
}
