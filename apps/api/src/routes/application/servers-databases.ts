import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { isServiceError } from "../../services/errors.js";
import {
  listServerDatabasesBasic,
  rotateServerDatabasePassword,
} from "../../services/server-databases.js";
import { requireApplicationServer } from "../../services/application-server-access.js";

/** Application API database mirrors (`servers.databases`). */
export function registerApplicationServerDatabasesRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/application/servers/:id/databases",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.databases",
        request.params.id,
      );
      if (!access) return;
      return listServerDatabasesBasic(access.server.id);
    },
  );

  app.post<{ Params: { id: string; dbId: string } }>(
    "/api/application/servers/:id/databases/:dbId/rotate-password",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.databases",
        request.params.id,
      );
      if (!access) return;

      const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
      const bytes = randomBytes(24);
      const password = Array.from(bytes, (b) => alphabet[b % alphabet.length]!).join("");

      try {
        return await rotateServerDatabasePassword({
          server: access.server,
          dbId: request.params.dbId,
          password,
          actor: `app:${access.ctx.prefix}`,
          activityMeta: { via: "application-api" },
        });
      } catch (err) {
        if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
        throw err;
      }
    },
  );
}
