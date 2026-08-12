import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApplication } from "../../auth/application-auth.js";
import { logActivity } from "../../activity-log.js";
import { serverListInclude, toMcServer } from "../../servers/serialize.js";
import { performServerPower } from "../../servers/power-actions.js";
import {
  countServers,
  deleteServer,
  findManyServers,
  findServer,
  findServerOrThrow,
  updateServer,
} from "../../services/servers.js";
import { findUser } from "../../services/users.js";
import {
  createServerApplicationSchema,
  powerSignalSchema,
} from "../../schemas/servers.js";

const createServerSchema = createServerApplicationSchema;

export function registerApplicationServerCoreRoutes(app: FastifyInstance): void {
  app.get("/api/application/servers", async (request, reply) => {
    if (!(await requireApplication(request, reply, "servers.read"))) return;
    const q = (request.query ?? {}) as Record<string, unknown>;
    const limit = Math.min(
      500,
      Math.max(1, Math.floor(Number.isFinite(Number(q.limit)) ? Number(q.limit) : 100)),
    );
    const offset = Math.max(
      0,
      Math.floor(Number.isFinite(Number(q.offset)) ? Number(q.offset) : 0),
    );
    const [rows, total] = await Promise.all([
      findManyServers({
        include: serverListInclude,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      countServers(),
    ]);
    void reply.header("x-total-count", String(total));
    return { servers: rows.map(toMcServer), total, limit, offset };
  });

  app.post("/api/application/servers", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "servers.write");
    if (!ctx) return;
    const parsed = createServerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;
    const owner = await findUser({ where: { id: data.ownerId } });
    if (!owner) return reply.status(404).send({ error: "Owner not found" });

    try {
      const { assertCanCreateServer } = await import("../../billing/quotas.js");
      await assertCanCreateServer(
        {
          id: owner.id,
          role: owner.role,
          maxServers: owner.maxServers,
          maxMemoryMb: owner.maxMemoryMb,
          maxDatabases: owner.maxDatabases,
        },
        data.memoryMb,
        { diskMb: data.diskMb },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(403).send({ error: message });
    }

    let nodeId: string;
    try {
      const { assertNodeCapacity, resolveCreateNodeId } = await import("../../nodes/nodes.js");
      nodeId = await resolveCreateNodeId(data.nodeId, {
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
      });
      await assertNodeCapacity(nodeId, data.memoryMb, { placement: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    try {
      const { provisionPreparedServer, autoStartProvisionedServer } = await import(
        "../../servers/server-provision.js"
      );
      const { id } = await provisionPreparedServer({
        name: data.name,
        type: data.type,
        mcVersion: data.mcVersion,
        port: data.port,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        ownerId: owner.id,
        nodeId,
        cleanupOnFailure: false,
        ...(data.paperBuild !== undefined ? { paperBuild: data.paperBuild } : {}),
        ...(data.fabricLoaderVersion !== undefined
          ? { fabricLoaderVersion: data.fabricLoaderVersion }
          : {}),
        ...(data.forgeVersion !== undefined ? { forgeVersion: data.forgeVersion } : {}),
      });

      await autoStartProvisionedServer(id);

      const refreshed = await findServerOrThrow({
        where: { id },
        include: serverListInclude,
      });

      logActivity({
        action: "server.create",
        actor: `app:${ctx.prefix}`,
        serverId: id,
        serverName: refreshed.name,
        metadata: {
          ownerId: owner.id,
          owner: owner.username,
          via: "application-api",
          keyId: ctx.keyId,
        },
      });

      return reply.status(201).send({ server: toMcServer(refreshed) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("already in use") ? 409 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/application/servers/:id", async (request, reply) => {
    if (!(await requireApplication(request, reply, "servers.read"))) return;
    const row = await findServer({
      where: { id: request.params.id },
      include: serverListInclude,
    });
    if (!row) return reply.status(404).send({ error: "Server not found" });
    return { server: toMcServer(row) };
  });

  app.patch<{ Params: { id: string } }>("/api/application/servers/:id", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "servers.update");
    if (!ctx) return;
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(64).optional(),
        memoryMb: z.number().int().min(512).max(65536).optional(),
        diskMb: z.number().int().min(1024).max(10_485_760).optional(),
        cpuLimit: z.number().int().min(0).max(6400).optional(),
        ownerId: z.string().min(1).optional(),
        suspended: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const existing = await findServer({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Server not found" });

    if (parsed.data.ownerId) {
      const owner = await findUser({
        where: { id: parsed.data.ownerId },
      });
      if (!owner) return reply.status(404).send({ error: "Owner not found" });
    }

    if (parsed.data.suspended === true) {
      const { processManager } = await import("../../servers/process-manager.js");
      if (processManager.isRunning(existing.id)) {
        await processManager.stop(existing.id);
      }
    }

    const updated = await updateServer({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.memoryMb != null ? { memoryMb: parsed.data.memoryMb } : {}),
        ...(parsed.data.diskMb != null ? { diskMb: parsed.data.diskMb } : {}),
        ...(parsed.data.cpuLimit != null ? { cpuLimit: parsed.data.cpuLimit } : {}),
        ...(parsed.data.ownerId != null ? { ownerId: parsed.data.ownerId } : {}),
        ...(parsed.data.suspended != null ? { suspended: parsed.data.suspended } : {}),
      },
      include: serverListInclude,
    });

    logActivity({
      action: "server.update",
      actor: `app:${ctx.prefix}`,
      serverId: updated.id,
      serverName: updated.name,
      metadata: { fields: Object.keys(parsed.data), via: "application-api", keyId: ctx.keyId },
    });

    return { server: toMcServer(updated) };
  });

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/power",
    async (request, reply) => {
      const ctx = await requireApplication(request, reply, "servers.power");
      if (!ctx) return;
      const parsed = z
        .object({
          signal: powerSignalSchema,
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const existing = await findServer({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Server not found" });

      const result = await performServerPower({
        server: existing,
        signal: parsed.data.signal,
        actor: `app:${ctx.prefix}`,
      });
      if (!result.ok) {
        return reply.status(result.status).send({
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
        });
      }
      return { server: result.server };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/application/servers/:id", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "servers.delete");
    if (!ctx) return;
    const server = await findServer({
      where: { id: request.params.id },
    });
    if (!server) return reply.status(404).send({ error: "Server not found" });

    const { processManager } = await import("../../servers/process-manager.js");
    const { destroyServerDatabases } = await import("../servers/databases.js");
    const { wipeServerEverywhere } = await import("../../servers/server-files.js");

    if (server.status === "TRANSFERRING" || server.status === "CREATING") {
      return reply
        .status(409)
        .send({ error: "Server is busy — wait for the current operation to finish" });
    }
    if (processManager.isRunning(server.id)) {
      await processManager.stop(server.id);
    }
    const { closeServerAllocationFirewalls, releaseServerAllocations } = await import(
      "../../servers/allocations.js"
    );
    await closeServerAllocationFirewalls(server.id, server.nodeId).catch(() => undefined);
    await destroyServerDatabases(server.id).catch(() => undefined);
    await wipeServerEverywhere(server.id).catch(() => undefined);
    await releaseServerAllocations(server.id).catch(() => undefined);
    await deleteServer({ where: { id: server.id } });

    logActivity({
      action: "server.delete",
      actor: `app:${ctx.prefix}`,
      serverId: null,
      serverName: server.name,
      metadata: { serverId: server.id, via: "application-api", keyId: ctx.keyId },
    });

    return reply.status(204).send();
  });
}
