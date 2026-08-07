import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import { prisma } from "../../db.js";

/** Lightweight counts for admin sidebar badges. */
export function registerAdminNavCountsRoutes(app: FastifyInstance): void {
  app.get("/api/admin/nav-counts", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const [servers, nodes, users] = await Promise.all([
      prisma.server.count(),
      prisma.node.count(),
      prisma.user.count(),
    ]);
    return { servers, nodes, users };
  });
}
