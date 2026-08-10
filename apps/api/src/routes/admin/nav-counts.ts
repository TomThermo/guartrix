import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import { countNodes } from "../../repositories/nodes.js";
import { countServers } from "../../repositories/servers.js";
import { countUsers } from "../../repositories/users.js";

/** Lightweight counts for admin sidebar badges. */
export function registerAdminNavCountsRoutes(app: FastifyInstance): void {
  app.get("/api/admin/nav-counts", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const [servers, nodes, users] = await Promise.all([
      countServers(),
      countNodes(),
      countUsers(),
    ]);
    return { servers, nodes, users };
  });
}
