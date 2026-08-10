import type { FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import { databaseNamePrefix, DEFAULT_MAX_DATABASES, type AuthUser, type ServerDatabase } from "@guartrix/shared";
import { logActivity } from "../activity-log.js";
import { assertCanCreateDatabase } from "../billing/quotas.js";
import {
  isSealedDatabasePassword,
  sealDatabasePassword,
  unsealDatabasePassword,
} from "../db-password.js";
import { prisma } from "../db.js";
import {
  DaemonHttpError,
  daemonMysqlCreate,
  daemonMysqlDelete,
  daemonMysqlEnsure,
  daemonMysqlRotatePassword,
  resolveNodeForServer,
} from "../nodes/daemon-client.js";
import { ServiceError } from "./errors.js";

export function serializeDatabase(row: {
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
    if (isSealedDatabasePassword(password)) {
      password = unsealDatabasePassword(password);
    }
  } catch {
    // Prefer not leaking ciphertext; plaintext legacy rows pass through above.
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
    throw new ServiceError(400, "Database name is required");
  }
  if (cleaned.length > 32) {
    throw new ServiceError(400, "Database name is too long (max 32 characters after the prefix)");
  }
  return cleaned;
}

function randomPassword(): string {
  return nanoid(24);
}

export async function resolveQuotaForServer(server: { ownerId: string | null }): Promise<{
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

export const createDatabaseSchema = z.object({
  /** Suffix only — panel prepends `s#####_`. */
  name: z.string().min(1).max(32),
  database: z.string().min(1).max(32).optional(),
});

export type CreateDatabaseInput = z.infer<typeof createDatabaseSchema>;

type AccessCtx = {
  user: AuthUser;
  server: Server;
};

function mapDaemonError(err: unknown): never {
  if (err instanceof DaemonHttpError) {
    throw new ServiceError(err.statusCode, err.message);
  }
  if (err instanceof ServiceError) throw err;
  const message = err instanceof Error ? err.message : String(err);
  throw new ServiceError(400, message);
}

export async function listServerDatabases(opts: {
  server: Pick<Server, "id" | "ownerId">;
}): Promise<{
  databases: ServerDatabase[];
  prefix: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  displayLimit: number | "unlimited";
}> {
  const rows = await prisma.database.findMany({
    where: { serverId: opts.server.id },
    orderBy: { createdAt: "asc" },
  });
  resealPlaintextPasswords(rows);
  const quota = await resolveQuotaForServer(opts.server);
  return {
    databases: rows.map(serializeDatabase),
    prefix: databaseNamePrefix(opts.server.id),
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
    displayLimit: quota.limit ?? "unlimited",
  };
}

/** Application API list — same serialize, no quota envelope. */
export async function listServerDatabasesBasic(serverId: string): Promise<{
  databases: ServerDatabase[];
  prefix: string;
}> {
  const rows = await prisma.database.findMany({
    where: { serverId },
    orderBy: { createdAt: "asc" },
  });
  return {
    databases: rows.map(serializeDatabase),
    prefix: databaseNamePrefix(serverId),
  };
}

export async function createServerDatabase(opts: {
  access: AccessCtx;
  body: CreateDatabaseInput;
  request: FastifyRequest;
}): Promise<{ database: ServerDatabase }> {
  const { access, body, request } = opts;
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
      throw new ServiceError(400, message);
    }
  } else if (quota.used >= DEFAULT_MAX_DATABASES) {
    throw new ServiceError(
      400,
      `You are currently using ${quota.used} of ${DEFAULT_MAX_DATABASES} databases.`,
    );
  }

  let nodeId = access.server.nodeId;
  try {
    const resolved = await resolveNodeForServer(access.server.id);
    nodeId = resolved.node.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ServiceError(503, message);
  }
  if (!nodeId) {
    throw new ServiceError(503, "Server has no node assigned");
  }

  const prefix = databaseNamePrefix(access.server.id);
  const suffix = sanitizeSuffix(body.database ?? body.name);
  const name = `${prefix}${suffix}`.slice(0, 64);
  if (!/^[a-zA-Z0-9_]{2,64}$/.test(name)) {
    throw new ServiceError(400, "Invalid database name — use letters, digits and underscore only");
  }

  const existing = await prisma.database.findFirst({
    where: { nodeId, name },
  });
  if (existing) {
    throw new ServiceError(400, "A database with this name already exists");
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
    mapDaemonError(err);
  }
}

export async function deleteServerDatabase(opts: {
  access: AccessCtx;
  dbId: string;
  request: FastifyRequest;
  log?: { warn: (obj: unknown, msg?: string) => void };
}): Promise<void> {
  const { access, dbId, request, log } = opts;
  const row = await prisma.database.findFirst({
    where: { id: dbId, serverId: access.server.id },
  });
  if (!row) throw new ServiceError(404, "Database not found");

  try {
    await daemonMysqlDelete(row.nodeId, {
      name: row.name,
      username: row.username,
      remote: row.remote,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log?.warn({ err: message }, "MySQL drop failed; removing panel record");
  }

  await prisma.database.delete({ where: { id: row.id } });
  logActivity({
    action: "database.delete",
    request,
    user: access.user,
    server: access.server,
    metadata: { database: row.name },
  });
}

export async function rotateServerDatabasePassword(opts: {
  server: Pick<Server, "id" | "name">;
  dbId: string;
  /** When omitted, generates a nanoid password (Client API). */
  password?: string;
  user?: AuthUser | null;
  request?: FastifyRequest;
  actor?: string;
  activityMeta?: Record<string, unknown>;
}): Promise<{ database: ServerDatabase }> {
  const row = await prisma.database.findFirst({
    where: { id: opts.dbId, serverId: opts.server.id },
  });
  if (!row) throw new ServiceError(404, "Database not found");

  const password = opts.password ?? randomPassword();
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
      request: opts.request,
      user: opts.user ?? undefined,
      actor: opts.actor,
      server: opts.server,
      metadata: {
        database: row.name,
        username: row.username,
        ...opts.activityMeta,
      },
    });
    return { database: serializeDatabase(updated) };
  } catch (err) {
    mapDaemonError(err);
  }
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
