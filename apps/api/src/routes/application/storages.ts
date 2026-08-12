import type { FastifyInstance } from "fastify";
import { requireApplication } from "../../auth/application-auth.js";

export function registerApplicationStorageRoutes(app: FastifyInstance): void {
  app.get("/api/application/storages", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    const { listStoragePools } = await import("../../services/storage-pools.js");
    return { storages: await listStoragePools() };
  });

  app.get<{ Params: { id: string } }>("/api/application/storages/:id", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    try {
      const { getStoragePool } = await import("../../services/storage-pools.js");
      const storage = await getStoragePool(request.params.id);
      return { storage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err && typeof err === "object" && "status" in err && Number((err as { status: number }).status) === 404
          ? 404
          : 400;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/application/nodes/:id/storages", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    try {
      const { listStoragePoolsForNode } = await import("../../services/storage-pools.js");
      const storages = await listStoragePoolsForNode(request.params.id);
      return { storages };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err && typeof err === "object" && "status" in err && Number((err as { status: number }).status) === 404
          ? 404
          : 400;
      return reply.status(status).send({ error: message });
    }
  });
}
