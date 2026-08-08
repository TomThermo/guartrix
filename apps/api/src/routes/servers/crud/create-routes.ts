import type { FastifyInstance } from "fastify";
import type { ServerType } from "@msm/shared";
import { assertAdminFullApiKey, requireWrite } from "../../../auth/auth.js";
import { logActivity } from "../../../activity-log.js";
import { config } from "../../../config.js";
import { prisma } from "../../../db.js";
import { listVersions } from "../../../providers/jars.js";
import { applyCreateWorldDefaults } from "../../../servers/server-lifecycle.js";
import { serverListInclude, toMcServer } from "../../../servers/serialize.js";
import { createSchema, SERVER_TYPES } from "./schemas.js";

export function registerServerCreateRoutes(app: FastifyInstance): void {
  app.get("/api/servers/create-defaults", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;
    return { defaultBackupKeepCount: config.defaultBackupKeepCount };
  });

  app.post("/api/servers", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;

    let validatedExtraMounts: import("@msm/shared").ServerExtraMount[] | null | undefined;
    if (data.extraMounts !== undefined) {
      try {
        const { parseExtraMounts } = await import("../../../servers/extra-mounts.js");
        validatedExtraMounts = parseExtraMounts(data.extraMounts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    }

    try {
      const { assertCanCreateServer } = await import("../../../billing/quotas.js");
      await assertCanCreateServer(user, data.memoryMb, { diskMb: data.diskMb });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(403).send({ error: message });
    }

    if (data.nodeId && user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Only admins can choose a node" });
    }
    if (data.nodeId && user.role === "ADMIN" && !assertAdminFullApiKey(request, reply)) {
      return;
    }

    let nodeId: string;
    try {
      const { assertNodeCapacity, resolveCreateNodeId } = await import("../../../nodes/nodes.js");
      nodeId = await resolveCreateNodeId(user.role === "ADMIN" ? data.nodeId : undefined);
      await assertNodeCapacity(nodeId, data.memoryMb, {
        placement: true,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    const { isGamePortAvailable } = await import("../../../servers/game-port.js");
    if (!(await isGamePortAvailable(nodeId, data.port, data.type))) {
      const { primaryAllocationProtocol } = await import("@msm/shared");
      const protocol = primaryAllocationProtocol(data.type);
      return reply.status(409).send({
        error: `Port ${data.port}/${protocol} is already in use`,
      });
    }

    try {
      const { provisionPreparedServer, autoStartProvisionedServer } = await import(
        "../../../servers/server-provision.js"
      );
      const { server: updated } = await provisionPreparedServer({
        name: data.name,
        type: data.type as ServerType,
        mcVersion: data.mcVersion,
        port: data.port,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        ownerId: user.id,
        nodeId,
        ensureSubdomain: true,
        cleanupOnFailure: true,
        ...(validatedExtraMounts !== undefined ? { extraMounts: validatedExtraMounts } : {}),
      });

      const preset = data.worldPreset ?? "DEFAULT";
      const levelType = preset === "FLAT" ? "flat" : preset === "VOID" ? "flat" : undefined;
      const generatorSettings =
        preset === "VOID"
          ? JSON.stringify({
              layers: [{ block: "minecraft:air", height: 1 }],
              biome: "minecraft:the_void",
            })
          : undefined;
      await applyCreateWorldDefaults(updated.id, {
        seed: data.seed,
        gamemode: data.gamemode,
        difficulty: data.difficulty,
        levelType,
        generatorSettings,
      }).catch((err) => {
        console.warn(
          `[guartrix] create world defaults failed for ${updated.id}:`,
          err instanceof Error ? err.message : err,
        );
      });

      const { applyInitialBackupRetention } = await import("../../../servers/backup-schedule.js");
      await applyInitialBackupRetention(updated.id, data.keepCount);

      logActivity({
        action: "server.create",
        request,
        user,
        server: updated,
        metadata: {
          type: updated.type,
          mcVersion: updated.mcVersion,
          port: updated.port,
          memoryMb: updated.memoryMb,
          diskMb: updated.diskMb,
          node: nodeId,
          worldPreset: preset,
        },
      });

      await autoStartProvisionedServer(updated.id);

      const refreshed = await prisma.server.findUniqueOrThrow({
        where: { id: updated.id },
        include: serverListInclude,
      });
      return reply.status(201).send(toMcServer(refreshed));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.create",
        request,
        user,
        serverId: null,
        serverName: data.name,
        success: false,
        metadata: { error: message, type: data.type, port: data.port },
      });
      const status = message.includes("already in use") ? 409 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Querystring: { type?: string } }>("/api/versions", async (request, reply) => {
    const type = (request.query.type ?? "VANILLA").toUpperCase();
    if (!(SERVER_TYPES as readonly string[]).includes(type)) {
      return reply.status(400).send({ error: "Invalid type" });
    }
    try {
      const versions = await listVersions(type as ServerType);
      return { type, versions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });
}
