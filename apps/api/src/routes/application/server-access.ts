import type { FastifyReply, FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import { requireApplication } from "../../auth/application-auth.js";
import type { ApplicationAuthContext } from "../../auth/application-keys.js";
import { prisma } from "../../db.js";

/** Load a server after Application scope check, or send 404. */
export async function requireApplicationServer(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: string,
  serverId: string,
): Promise<{ ctx: ApplicationAuthContext; server: Server } | null> {
  const ctx = await requireApplication(request, reply, scope);
  if (!ctx) return null;
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    reply.status(404).send({ error: "Server not found" });
    return null;
  }
  return { ctx, server };
}
