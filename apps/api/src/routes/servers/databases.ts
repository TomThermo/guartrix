import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../../auth/auth.js";
import { isServiceError } from "../../services/errors.js";
import {
  createDatabaseSchema,
  createServerDatabase,
  deleteServerDatabase,
  listServerDatabases,
  rotateServerDatabasePassword,
} from "../../services/server-databases.js";

export { destroyServerDatabases } from "../../services/server-databases.js";

export function registerDatabaseRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/databases", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "database.read",
    });
    if (!access) return;
    return listServerDatabases({ server: access.server });
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/databases", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "database.create",
    });
    if (!access) return;
    const parsed = createDatabaseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      return await createServerDatabase({ access, body: parsed.data, request });
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });

  app.delete<{ Params: { id: string; dbId: string } }>(
    "/api/servers/:id/databases/:dbId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "database.delete",
      });
      if (!access) return;

      try {
        await deleteServerDatabase({
          access,
          dbId: request.params.dbId,
          request,
          log: request.log,
        });
        return reply.status(204).send();
      } catch (err) {
        if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string; dbId: string } }>(
    "/api/servers/:id/databases/:dbId/rotate-password",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "database.update",
      });
      if (!access) return;

      try {
        return await rotateServerDatabasePassword({
          server: access.server,
          dbId: request.params.dbId,
          user: access.user,
          request,
        });
      } catch (err) {
        if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
        throw err;
      }
    },
  );
}
