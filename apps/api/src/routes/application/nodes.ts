import type { FastifyInstance } from "fastify";
import { requireApplication } from "../../auth/application-auth.js";

export function registerApplicationNodeRoutes(app: FastifyInstance): void {
  app.get("/api/application/nodes", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    const { listNodesWithUsage } = await import("../../nodes/nodes.js");
    return { nodes: await listNodesWithUsage() };
  });

  app.get<{ Params: { id: string } }>("/api/application/nodes/:id/storages", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    try {
      const { listStoragePoolsForNode } = await import("../../services/storage-pools.js");
      const storages = await listStoragePoolsForNode(request.params.id);
      return { storages };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/api/application/storages", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    const { listStoragePools } = await import("../../services/storage-pools.js");
    return { storages: await listStoragePools() };
  });
}
