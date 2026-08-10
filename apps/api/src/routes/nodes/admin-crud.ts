import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { requireAdmin } from "../../auth/auth.js";
import { createSchema, updateSchema } from "./schemas.js";
import {
  createAdminNode,
  deleteAdminNode,
  updateAdminNode,
} from "../../services/nodes-admin.js";

export function registerNodeAdminCrudRoutes(app: FastifyInstance): void {
  app.post("/api/admin/nodes", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      return await createAdminNode(request, admin, parsed.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_QUOTA",
      });
    }
  });

  app.patch<{ Params: { id: string } }>("/api/admin/nodes/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const result = await updateAdminNode(request, admin, request.params.id, parsed.data);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return { node: result.node };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/nodes/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const result = await deleteAdminNode(request, admin, request.params.id);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return { ok: true };
  });
}
