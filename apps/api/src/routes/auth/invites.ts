import type { FastifyInstance } from "fastify";
import { getSessionUser, isAuthenticated } from "../../auth/auth.js";
import { prisma } from "../../db.js";
import { hashInviteToken } from "../../servers/server-access.js";
import { logActivity } from "../../activity-log.js";

/** Public invite peek: never leak the full invite email without a session. */
function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const keep = local.length <= 1 ? 1 : 1;
  return `${local.slice(0, keep)}***@${domain}`;
}

export function registerInviteRoutes(app: FastifyInstance): void {
  app.get<{ Params: { token: string } }>(
    "/api/invites/:token",
    async (request, reply) => {
      const raw = request.params.token?.trim();
      if (!raw || raw.length < 16) {
        return reply.status(404).send({ error: "Invite not found" });
      }
      const row = await prisma.subUser.findFirst({
        where: {
          inviteTokenHash: hashInviteToken(raw),
          inviteExpiresAt: { gt: new Date() },
        },
        include: {
          server: { select: { id: true, name: true } },
        },
      });
      if (!row) return reply.status(404).send({ error: "Invite not found or expired" });

      const authed = isAuthenticated(request);
      const sessionUser = authed ? await getSessionUser(request) : null;
      const emailHint = maskEmail(row.email);

      // Unauthenticated: minimal peek — no email, server id/name (token-in-URL leak risk).
      if (!sessionUser) {
        return {
          email: null,
          emailHint,
          serverId: null,
          serverName: null,
          expiresAt: row.inviteExpiresAt?.toISOString() ?? null,
          alreadyLinked: Boolean(row.userId),
        };
      }

      return {
        email: row.email,
        emailHint,
        serverId: row.server.id,
        serverName: row.server.name,
        expiresAt: row.inviteExpiresAt?.toISOString() ?? null,
        alreadyLinked: Boolean(row.userId),
      };
    },
  );

  app.post<{ Params: { token: string } }>(
    "/api/invites/:token/accept",
    async (request, reply) => {
      if (!isAuthenticated(request)) {
        return reply.status(401).send({ error: "Sign in to accept this invite" });
      }
      const user = await getSessionUser(request);
      if (!user) return reply.status(401).send({ error: "Unauthorized" });

      const raw = request.params.token?.trim();
      if (!raw) return reply.status(404).send({ error: "Invite not found" });

      const row = await prisma.subUser.findFirst({
        where: {
          inviteTokenHash: hashInviteToken(raw),
          inviteExpiresAt: { gt: new Date() },
        },
        include: { server: true },
      });
      if (!row) {
        return reply.status(404).send({ error: "Invite not found or expired" });
      }

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const email = dbUser?.email?.trim().toLowerCase();
      if (!email || email !== row.email.toLowerCase()) {
        return reply.status(403).send({
          error: `Sign in with the invited email address to accept this invite`,
          emailHint: maskEmail(row.email),
        });
      }

      await prisma.subUser.update({
        where: { id: row.id },
        data: {
          userId: user.id,
          inviteTokenHash: null,
          inviteExpiresAt: null,
        },
      });

      logActivity({
        action: "subuser.update",
        request,
        user,
        server: row.server,
        metadata: { subuser: row.email, acceptedInvite: true },
      });

      return { ok: true, serverId: row.serverId };
    },
  );
}
