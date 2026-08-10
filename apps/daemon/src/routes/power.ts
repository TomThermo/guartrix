import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ServerType } from "@guartrix/shared";
import { ALL_SERVER_TYPES } from "@guartrix/shared";
import {
  listGuartrixContainers,
  processManager,
  writeServerLimits,
  type DaemonServerConfig,
} from "@guartrix/node-agent";
import { assertDaemonAllowsStart, DaemonLicenseError } from "../license-gate.js";

const serverTypeSchema = z.enum(ALL_SERVER_TYPES as [ServerType, ...ServerType[]]);

const daemonServerConfigSchema = z.object({
  id: z.string().min(1),
  type: serverTypeSchema,
  mcVersion: z.string().min(1),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  autoRestart: z.boolean(),
  javaVersion: z.string().min(1).max(8).nullable().optional(),
  startupCommand: z.string().max(4000).nullable().optional(),
  serverJar: z.string().min(1).max(128).nullable().optional(),
  diskMb: z.number().int().min(0).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  ports: z
    .array(
      z.object({
        port: z.number().int().min(1024).max(65535),
        protocol: z.enum(["tcp", "udp"]),
      }),
    )
    .max(64)
    .optional(),
  startupNotices: z.array(z.string().min(1).max(500)).max(8).optional(),
});

const powerBodySchema = z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
  server: daemonServerConfigSchema.optional(),
});

const commandBodySchema = z.object({
  command: z.string().min(1),
});

async function activeGameServerIds(): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const containers = await listGuartrixContainers();
    for (const c of containers) {
      if (c.isMysql || !c.serverId) continue;
      const state = (c.state || "").toLowerCase();
      if (state === "running" || state === "restarting") {
        ids.add(c.serverId);
      }
    }
  } catch {
    /* docker may be briefly unavailable */
  }
  // Also trust in-memory STARTING (container not listed yet).
  // processManager doesn't expose a list API — probe known configs via getLastConfig is incomplete.
  // Power start path passes server id; we only need "others", so container list is enough.
  return [...ids];
}

async function enforceStartGate(server: DaemonServerConfig): Promise<void> {
  const others = await activeGameServerIds();
  assertDaemonAllowsStart({
    serverId: server.id,
    memoryMb: server.memoryMb,
    diskMb: server.diskMb ?? 10_240,
    otherActiveServerIds: others,
  });
}

/** Power control, resource limits, and console command routes. */
export function registerDaemonPowerRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>("/servers/:id/power", async (request, reply) => {
    const parsed = powerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { action, server } = parsed.data;
    const id = request.params.id;

    try {
      if (action === "stop") {
        await processManager.stop(id);
        return { ok: true, status: processManager.getStatus(id) };
      }

      if (action === "kill") {
        await processManager.kill(id);
        return { ok: true, status: processManager.getStatus(id) };
      }

      if (action === "start") {
        if (!server) {
          return reply.status(400).send({ error: "server config is required for start" });
        }
        if (server.id !== id) {
          return reply.status(400).send({ error: "server.id must match path :id" });
        }
        await enforceStartGate(server as DaemonServerConfig);
        await processManager.start(server as DaemonServerConfig);
        return { ok: true, status: processManager.getStatus(id) };
      }

      // restart = stop then start
      await processManager.stop(id);
      const cfg = server ?? processManager.getLastConfig(id);
      if (!cfg) {
        return reply.status(400).send({
          error: "server config is required for restart when no prior start",
        });
      }
      const next: DaemonServerConfig = { ...cfg, id };
      await enforceStartGate(next);
      await processManager.start(next);
      return { ok: true, status: processManager.getStatus(id) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof DaemonLicenseError ? err.code : undefined;
      return reply
        .status(err instanceof DaemonLicenseError ? 403 : 400)
        .send({ error: message, ...(code ? { code } : {}) });
    }
  });

  app.put<{ Params: { id: string } }>("/servers/:id/limits", async (request, reply) => {
    const parsed = z
      .object({
        diskMb: z.number().int().min(0).max(10_485_760),
        cpuLimit: z.number().int().min(0).max(10_000),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    await writeServerLimits(request.params.id, parsed.data);
    return { ok: true, ...parsed.data };
  });

  app.post<{ Params: { id: string } }>("/servers/:id/command", async (request, reply) => {
    const parsed = commandBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await processManager.sendCommand(request.params.id, parsed.data.command);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
