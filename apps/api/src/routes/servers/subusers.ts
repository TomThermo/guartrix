import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../../auth/auth.js";
import { isServiceError } from "../../services/errors.js";
import {
  createServerSubUser,
  createSubUserSchema,
  deleteServerSubUser,
  listServerSubUsers,
  resendSubUserInvite,
  updateServerSubUser,
  updateSubUserSchema,
} from "../../services/subusers.js";

export function registerSubUserRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/subusers", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "user.read",
    });
    if (!access) return;
    return listServerSubUsers(access.server.id);
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/subusers", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "user.create",
    });
    if (!access) return;

    const parsed = createSubUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const body = await createServerSubUser({ access, body: parsed.data, request });
      return reply.status(201).send(body);
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });

  app.post<{ Params: { id: string; subUserId: string } }>(
    "/api/servers/:id/subusers/:subUserId/invite",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.create",
      });
      if (!access) return;

      try {
        return await resendSubUserInvite({ access, subUserId: request.params.subUserId });
      } catch (err) {
        if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
        throw err;
      }
    },
  );

  app.patch<{ Params: { id: string; subUserId: string } }>(
    "/api/servers/:id/subusers/:subUserId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.update",
      });
      if (!access) return;

      const parsed = updateSubUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        return await updateServerSubUser({
          access,
          subUserId: request.params.subUserId,
          body: parsed.data,
          request,
        });
      } catch (err) {
        if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string; subUserId: string } }>(
    "/api/servers/:id/subusers/:subUserId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.delete",
      });
      if (!access) return;

      try {
        return await deleteServerSubUser({
          access,
          subUserId: request.params.subUserId,
          request,
        });
      } catch (err) {
        if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
        throw err;
      }
    },
  );
}
