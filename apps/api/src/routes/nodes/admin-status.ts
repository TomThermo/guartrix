import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import {
  getNodeLiveStatus,
  regenerateAdminNodeToken,
  testAdminNode,
} from "../../services/nodes-admin.js";

export function registerNodeAdminStatusRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/admin/nodes/:id/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.read"))) return;
    const result = await getNodeLiveStatus(request.params.id);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return result.body;
  });

  app.post<{ Params: { id: string } }>("/api/admin/nodes/:id/test", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.write"))) return;
    const result = await testAdminNode(request.params.id);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return { ...result.result, node: result.node };
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/regenerate-token",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const result = await regenerateAdminNodeToken(request, admin, request.params.id);
      if (!result.ok) return reply.status(result.status).send({ error: result.error });
      return { node: result.node, token: result.token };
    },
  );
}
