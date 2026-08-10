import type { FastifyInstance } from "fastify";
import { assertAdminFullApiKey, requireServerAccess } from "../../../auth/auth.js";
import { cloneServerFromSource, deleteOwnedServer } from "../../../services/servers-lifecycle.js";
import { cloneSchema } from "./schemas.js";

export function registerServerDeleteCloneRoutes(app: FastifyInstance): void {
  app.delete<{ Params: { id: string }; Body: { password?: string } }>(
    "/api/servers/:id",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;

      const password = typeof request.body?.password === "string" ? request.body.password : "";
      const result = await deleteOwnedServer(access.server, access.user, request, password);
      if (!result.ok) {
        return reply.status(result.status).send({ error: result.error });
      }
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/clone",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const parsed = cloneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (
        parsed.data.nodeId &&
        access.user.role === "ADMIN" &&
        !assertAdminFullApiKey(request, reply)
      ) {
        return;
      }

      const result = await cloneServerFromSource(
        access.server,
        access.user,
        parsed.data,
        request,
      );
      if (!result.ok) {
        return reply
          .status(result.status)
          .send(typeof result.error === "string" ? { error: result.error } : result.error);
      }
      return reply.status(201).send(result.body);
    },
  );
}
