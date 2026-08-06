import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import { buildReadinessReport } from "../../admin-readiness.js";
import { getJobsStatus } from "../../jobs/queue.js";

export function registerAdminReadinessRoutes(app: FastifyInstance): void {
  app.get("/api/admin/readiness", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;
    const jobs = await getJobsStatus();
    return buildReadinessReport({ jobs });
  });

  app.get("/api/admin/jobs", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;
    return getJobsStatus();
  });
}
