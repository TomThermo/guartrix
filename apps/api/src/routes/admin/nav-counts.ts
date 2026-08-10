import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import { getAdminNavCounts } from "../../services/admin-nav.js";

/** Lightweight counts for admin sidebar badges. */
export function registerAdminNavCountsRoutes(app: FastifyInstance): void {
  app.get("/api/admin/nav-counts", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    return getAdminNavCounts();
  });
}
