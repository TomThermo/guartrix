import type { FastifyInstance } from "fastify";
import { getSessionUser, isAuthenticated } from "../auth/auth.js";
import { prisma } from "../db.js";
import { hashInviteToken } from "../servers/server-access.js";
import { logActivity } from "../activity-log.js";

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
      return {
        email: row.email,
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
          error: `Sign in with ${row.email} to accept this invite`,
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
