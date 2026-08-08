import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { databaseNamePrefix } from "@msm/shared";
import { prisma } from "../../db.js";
import {
  isSealedDatabasePassword,
  sealDatabasePassword,
  unsealDatabasePassword,
} from "../../db-password.js";
import {
  DaemonHttpError,
  daemonMysqlEnsure,
  daemonMysqlRotatePassword,
} from "../../nodes/daemon-client.js";
import { logActivity } from "../../activity-log.js";
import { requireApplicationServer } from "./server-access.js";

function serializeDatabase(row: {
  id: string;
  serverId: string;
  nodeId: string;
  name: string;
  username: string;
  password: string;
  host: string;
  port: number;
  remote: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let password = row.password;
  try {
    if (isSealedDatabasePassword(password)) {
      password = unsealDatabasePassword(password);
    }
  } catch {
    password = "";
  }
  return {
    id: row.id,
    serverId: row.serverId,
    nodeId: row.nodeId,
    name: row.name,
    username: row.username,
    password,
    host: row.host,
    port: row.port,
    remote: row.remote,
    jdbcUrl: `jdbc:mysql://${row.host}:${row.port}/${row.name}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
      const rows = await prisma.database.findMany({
        where: { serverId: access.server.id },
        orderBy: { createdAt: "asc" },
      });
      return {
        databases: rows.map(serializeDatabase),
        prefix: databaseNamePrefix(access.server.id),
      };
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
      const row = await prisma.database.findFirst({
        where: { id: request.params.dbId, serverId: access.server.id },
      });
      if (!row) return reply.status(404).send({ error: "Database not found" });

      const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
      const bytes = randomBytes(24);
      const password = Array.from(bytes, (b) => alphabet[b % alphabet.length]!).join("");

      try {
        await daemonMysqlEnsure(row.nodeId);
        const rotated = await daemonMysqlRotatePassword(row.nodeId, {
          name: row.name,
          username: row.username,
          password,
          remote: row.remote,
        });
        const updated = await prisma.database.update({
          where: { id: row.id },
          data: {
            password: sealDatabasePassword(rotated.database.password),
            host: rotated.database.host,
            port: rotated.database.port,
            remote: rotated.database.remote,
          },
        });
        logActivity({
          action: "database.rotate-password",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: { database: row.name, via: "application-api" },
        });
        return { database: serializeDatabase(updated) };
      } catch (err) {
        if (err instanceof DaemonHttpError) {
          return reply.status(err.statusCode).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
