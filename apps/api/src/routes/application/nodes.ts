import type { FastifyInstance } from "fastify";
import { requireApplication } from "../../auth/application-auth.js";

export function registerApplicationNodeRoutes(app: FastifyInstance): void {
  app.get("/api/application/nodes", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    const { listNodesWithUsage } = await import("../../nodes/nodes.js");
    return { nodes: await listNodesWithUsage() };
  });
}
