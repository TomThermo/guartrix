import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdminFullApiKey, requireServerAccess } from "../../auth/auth.js";
import { prisma } from "../../db.js";
import { serverListInclude, toMcServer } from "../../servers/serialize.js";

const transferSchema = z.object({
  nodeId: z.string().min(1),
  port: z.number().int().min(1024).max(65535).optional(),
  startAfter: z.boolean().optional(),
});

/** Node transfer routes (split from servers.ts). */
export function registerServerTransferRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/transfer",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      if (access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can move servers between nodes" });
      }
      if (!assertAdminFullApiKey(request, reply)) return;
      const parsed = transferSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const { startServerTransfer, getTransferJob } = await import("../../servers/transfer.js");
        const job = await startServerTransfer({
          serverId: access.server.id,
          toNodeId: parsed.data.nodeId,
          port: parsed.data.port,
          startAfter: parsed.data.startAfter,
          actor: access.user,
        });
        const updated = await prisma.server.findUniqueOrThrow({
          where: { id: access.server.id },
          include: serverListInclude,
        });
        return reply.status(202).send({
          server: toMcServer(updated),
          transfer: job ?? getTransferJob(access.server.id),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/servers/:id/transfer", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      ownerOnly: true,
    });
    if (!access) return;
    const { getTransferJob } = await import("../../servers/transfer.js");
    const job = getTransferJob(access.server.id);
    if (!job) {
      return {
        transfer: null,
        server: toMcServer(
          await prisma.server.findUniqueOrThrow({
            where: { id: access.server.id },
            include: serverListInclude,
          }),
        ),
      };
    }
    return {
      transfer: job,
      server: toMcServer(
        await prisma.server.findUniqueOrThrow({
          where: { id: access.server.id },
          include: serverListInclude,
        }),
      ),
    };
  });
}
