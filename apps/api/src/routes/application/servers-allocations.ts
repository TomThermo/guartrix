import type { FastifyInstance } from "fastify";
import { ensurePrimaryAllocation, serializeAllocation } from "../../servers/allocations.js";
import { prisma } from "../../db.js";
import { requireApplicationServer } from "./server-access.js";

/** Application API allocation mirrors (`servers.allocations`). */
export function registerApplicationServerAllocationsRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/application/servers/:id/allocations",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.allocations",
        request.params.id,
      );
      if (!access) return;

      if (access.server.nodeId) {
        await ensurePrimaryAllocation({
          serverId: access.server.id,
          nodeId: access.server.nodeId,
          port: access.server.port,
        }).catch(() => undefined);
      }

      const rows = await prisma.allocation.findMany({
        where: { serverId: access.server.id },
        include: { server: { select: { name: true } } },
        orderBy: [{ isPrimary: "desc" }, { port: "asc" }],
      });

      const free = access.server.nodeId
        ? await prisma.allocation.findMany({
            where: { nodeId: access.server.nodeId, serverId: null },
            include: { server: { select: { name: true } } },
            orderBy: { port: "asc" },
            take: 200,
          })
        : [];

      return {
        allocations: rows.map(serializeAllocation),
        free: free.map(serializeAllocation),
      };
    },
  );
}
