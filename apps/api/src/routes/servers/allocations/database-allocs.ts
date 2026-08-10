import type { FastifyInstance } from "fastify";
import { logActivity } from "../../../activity-log.js";
import { requireAdmin } from "../../../auth/auth.js";
import { createNodeAllocationRange, serializeAllocation } from "../../../servers/allocations.js";
import { createRangeSchema } from "./schemas.js";
import { deleteAllocation, findFirstAllocation, findManyAllocations } from "../../../repositories/allocations.js";
import { findNode } from "../../../repositories/nodes.js";

/** Admin node allocation pool (list / create range / delete free). */
export function registerAllocationDatabaseRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/allocations",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const node = await findNode({
        where: { id: request.params.id },
      });
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }
      const rows = await findManyAllocations({
        where: { nodeId: node.id },
        include: { server: { select: { name: true } } },
        orderBy: [{ port: "asc" }, { protocol: "asc" }],
      });
      return {
        allocations: rows.map(serializeAllocation),
        assigned: rows.filter((r) => r.serverId).length,
        free: rows.filter((r) => !r.serverId).length,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/allocations",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const node = await findNode({
        where: { id: request.params.id },
      });
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }
      const parsed = createRangeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const portEnd = parsed.data.portEnd ?? parsed.data.portStart;
      if (portEnd < parsed.data.portStart) {
        return reply.status(400).send({ error: "portEnd must be >= portStart" });
      }
      if (portEnd - parsed.data.portStart > 500) {
        return reply.status(400).send({ error: "Range too large (max 500 ports)" });
      }
      const result = await createNodeAllocationRange({
        nodeId: node.id,
        portStart: parsed.data.portStart,
        portEnd,
        protocol: parsed.data.protocol,
        ip: parsed.data.ip,
        notes: parsed.data.notes,
      });
      const rows = await findManyAllocations({
        where: { nodeId: node.id },
        include: { server: { select: { name: true } } },
        orderBy: [{ port: "asc" }, { protocol: "asc" }],
      });
      logActivity({
        action: "allocation.pool-create",
        request,
        user: admin,
        metadata: {
          node: node.name,
          portStart: parsed.data.portStart,
          portEnd,
          protocol: parsed.data.protocol,
          created: result.created,
        },
      });
      return {
        ...result,
        allocations: rows.map(serializeAllocation),
      };
    },
  );

  app.delete<{ Params: { id: string; allocId: string } }>(
    "/api/admin/nodes/:id/allocations/:allocId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const row = await findFirstAllocation({
        where: { id: request.params.allocId, nodeId: request.params.id },
      });
      if (!row) {
        return reply.status(404).send({ error: "Allocation not found" });
      }
      if (row.serverId) {
        return reply.status(400).send({ error: "Unassign the allocation from its server first" });
      }
      await deleteAllocation({ where: { id: row.id } });
      logActivity({
        action: "allocation.pool-delete",
        request,
        user: admin,
        metadata: { nodeId: row.nodeId, port: row.port, protocol: row.protocol },
      });
      return reply.status(204).send();
    },
  );
}
