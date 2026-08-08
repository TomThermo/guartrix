import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { databaseNamePrefix, DEFAULT_MAX_DATABASES, type ServerDatabase } from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import { requireServerAccess } from "../../auth/auth.js";
import {
  DaemonHttpError,
  daemonMysqlCreate,
  daemonMysqlDelete,
  daemonMysqlEnsure,
  daemonMysqlRotatePassword,
  resolveNodeForServer,
} from "../../nodes/daemon-client.js";
import {
  isSealedDatabasePassword,
  sealDatabasePassword,
  unsealDatabasePassword,
} from "../../db-password.js";
import { prisma } from "../../db.js";
import { assertCanCreateDatabase } from "../../billing/quotas.js";

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
}): ServerDatabase {
  let password = row.password;
  try {
    password = unsealDatabasePassword(row.password);
  } catch {
    password = row.password;
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

/** Best-effort: seal legacy plaintext passwords still stored in the panel DB. */
function resealPlaintextPasswords(rows: Array<{ id: string; password: string }>): void {
  for (const row of rows) {
    if (isSealedDatabasePassword(row.password)) continue;
    void prisma.database
      .update({
        where: { id: row.id },
        data: { password: sealDatabasePassword(row.password) },
      })
      .catch(() => undefined);
  }
}

function sanitizeSuffix(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned || cleaned.length < 1) {
    throw new Error("Database name is required");
  }
  if (cleaned.length > 32) {
    throw new Error("Database name is too long (max 32 characters after the prefix)");
  }
  return cleaned;
}

function randomPassword(): string {
  return nanoid(24);
}

async function resolveQuotaForServer(server: { ownerId: string | null }): Promise<{
  used: number;
  limit: number | null;
  remaining: number | null;
  owner: { id: string; role: "ADMIN" | "OPERATOR" | "VIEWER"; maxDatabases: number | null } | null;
}> {
  if (!server.ownerId) {
    const used = 0;
    return { used, limit: DEFAULT_MAX_DATABASES, remaining: DEFAULT_MAX_DATABASES, owner: null };
  }
  const owner = await prisma.user.findUnique({ where: { id: server.ownerId } });
  const used = await prisma.database.count({
    where: { server: { ownerId: server.ownerId } },
  });
  if (!owner || owner.role === "ADMIN") {
    return {
      used,
      limit: null,
      remaining: null,
      owner: owner ? { id: owner.id, role: owner.role, maxDatabases: null } : null,
    };
  }
  const limit = owner.maxDatabases;
  const remaining = limit == null ? null : Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    owner: {
      id: owner.id,
      role: owner.role,
      maxDatabases: owner.maxDatabases,
    },
  };
}

const createSchema = z.object({
  /** Suffix only — panel prepends `s#####_`. */
  name: z.string().min(1).max(32),
  database: z.string().min(1).max(32).optional(),
});

export function registerDatabaseRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/databases", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "database.read",
    });
    if (!access) return;

    const rows = await prisma.database.findMany({
      where: { serverId: access.server.id },
      orderBy: { createdAt: "asc" },
    });
    resealPlaintextPasswords(rows);
    const quota = await resolveQuotaForServer(access.server);
    const limit = quota.limit ?? DEFAULT_MAX_DATABASES;
    const _remaining = quota.remaining == null ? Math.max(0, limit - quota.used) : quota.remaining;
    return {
      databases: rows.map(serializeDatabase),
      prefix: databaseNamePrefix(access.server.id),
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
      displayLimit: quota.limit ?? "unlimited",
    };
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/databases", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "database.create",
    });
    if (!access) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const quota = await resolveQuotaForServer(access.server);
    if (quota.owner) {
      try {
        await assertCanCreateDatabase({
          id: quota.owner.id,
          role: quota.owner.role,
          maxServers: null,
          maxMemoryMb: null,
          maxDatabases: quota.owner.maxDatabases,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    } else if (quota.used >= DEFAULT_MAX_DATABASES) {
      return reply.status(400).send({
        error: `You are currently using ${quota.used} of ${DEFAULT_MAX_DATABASES} databases.`,
      });
    }

    let nodeId = access.server.nodeId;
    try {
      const resolved = await resolveNodeForServer(access.server.id);
      nodeId = resolved.node.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(503).send({ error: message });
    }
    if (!nodeId) {
      return reply.status(503).send({ error: "Server has no node assigned" });
    }

    const prefix = databaseNamePrefix(access.server.id);
    let suffix: string;
    try {
      suffix = sanitizeSuffix(parsed.data.database ?? parsed.data.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    const name = `${prefix}${suffix}`.slice(0, 64);
    if (!/^[a-zA-Z0-9_]{2,64}$/.test(name)) {
      return reply.status(400).send({
        error: "Invalid database name — use letters, digits and underscore only",
      });
    }

    const existing = await prisma.database.findFirst({
      where: { nodeId, name },
    });
    if (existing) {
      return reply.status(400).send({ error: "A database with this name already exists" });
    }

    const username = `${prefix}u${nanoid(6)}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
    const password = randomPassword();

    try {
      await daemonMysqlEnsure(nodeId);
      const created = await daemonMysqlCreate(nodeId, {
        name,
        username,
        password,
        remote: "172.%",
      });

      const row = await prisma.database.create({
        data: {
          id: nanoid(12),
          serverId: access.server.id,
          nodeId,
          name: created.database.name,
          username: created.database.username,
          password: sealDatabasePassword(created.database.password),
          host: created.database.host,
          port: created.database.port,
          remote: created.database.remote,
        },
      });

      await prisma.node
        .update({
          where: { id: nodeId },
          data: { mysqlPort: created.database.port },
        })
        .catch(() => undefined);

      logActivity({
        action: "database.create",
        request,
        user: access.user,
        server: access.server,
        metadata: { database: row.name, username: row.username, host: row.host },
      });

      return { database: serializeDatabase(row) };
    } catch (err) {
      if (err instanceof DaemonHttpError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string; dbId: string } }>(
    "/api/servers/:id/databases/:dbId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "database.delete",
      });
      if (!access) return;
      const row = await prisma.database.findFirst({
        where: { id: request.params.dbId, serverId: access.server.id },
      });
      if (!row) return reply.status(404).send({ error: "Database not found" });

      try {
        await daemonMysqlDelete(row.nodeId, {
          name: row.name,
          username: row.username,
          remote: row.remote,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.warn({ err: message }, "MySQL drop failed; removing panel record");
      }

      await prisma.database.delete({ where: { id: row.id } });
      logActivity({
        action: "database.delete",
        request,
        user: access.user,
        server: access.server,
        metadata: { database: row.name },
      });
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string; dbId: string } }>(
    "/api/servers/:id/databases/:dbId/rotate-password",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "database.update",
      });
      if (!access) return;
      const row = await prisma.database.findFirst({
        where: { id: request.params.dbId, serverId: access.server.id },
      });
      if (!row) return reply.status(404).send({ error: "Database not found" });

      const password = randomPassword();
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
          request,
          user: access.user,
          server: access.server,
          metadata: { database: row.name, username: row.username },
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

/** Drop MySQL schemas for a server before deleting the server row. */
export async function destroyServerDatabases(serverId: string): Promise<void> {
  const rows = await prisma.database.findMany({ where: { serverId } });
  for (const row of rows) {
    try {
      await daemonMysqlDelete(row.nodeId, {
        name: row.name,
        username: row.username,
        remote: row.remote,
      });
    } catch {
      // best-effort
    }
  }
  if (rows.length) {
    await prisma.database.deleteMany({ where: { serverId } });
  }
}
