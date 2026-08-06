import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ServerType } from "@msm/shared";
import { isAuthenticated, requireAdmin } from "../../auth/auth.js";
import {
  ensureViaForBots,
  resolveBotClientVersion,
} from "../../bots/bot-compat.js";
import { botManager, DEFAULT_COUNT } from "../../bots/bot-manager-proxy.js";
import { prisma } from "../../db.js";
import { processManager } from "../../servers/process-manager.js";
import { readServerProperties } from "../../servers/properties.js";
import { serverDir } from "../../config.js";

const spawnSchema = z.object({
  count: z.number().int().min(1).max(20).optional(),
  prefix: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("say"),
    text: z.string().min(1).max(256),
  }),
  z.object({
    type: z.literal("look"),
    yaw: z.number(),
    pitch: z.number(),
  }),
  z.object({ type: z.literal("quit") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("jump") }),
  z.object({
    type: z.literal("goto"),
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    player: z.string().min(1).max(16).optional(),
  }),
  z.object({
    type: z.literal("follow"),
    player: z.string().min(1).max(16),
  }),
  z.object({
    type: z.literal("attack"),
    player: z.string().min(1).max(16).optional(),
  }),
  z.object({
    type: z.literal("collect"),
    item: z.string().min(1).max(64).optional(),
    count: z.number().int().min(1).max(64).optional(),
  }),
  z.object({
    type: z.literal("chop"),
    block: z.string().min(1).max(64).optional(),
  }),
  z.object({
    type: z.literal("dig"),
    block: z.string().min(1).max(64).optional(),
  }),
  z.object({ type: z.literal("wander") }),
  z.object({
    type: z.literal("guard"),
    radius: z.number().int().min(2).max(32).optional(),
  }),
  z.object({
    type: z.literal("ai"),
    prompt: z.string().min(1).max(200),
  }),
]);

export function registerBotRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.includes("/bots")) return;
    if (!pathOnly.startsWith("/api/servers/")) return;
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (!(await requireAdmin(request, reply))) return;
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/bots",
    async (request, reply) => {
      const server = await prisma.server.findUnique({
        where: { id: request.params.id },
      });
      if (!server) return reply.status(404).send({ error: "Not found" });
      const compat = resolveBotClientVersion(server.mcVersion);
      return {
        bots: await botManager.listBots(server.id),
        clientVersion: compat.clientVersion,
        needsVia: compat.needsVia,
      };
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/bots",
    async (request, reply) => {
      const server = await prisma.server.findUnique({
        where: { id: request.params.id },
      });
      if (!server) return reply.status(404).send({ error: "Not found" });

      if (!processManager.isRunning(server.id) || server.status !== "RUNNING") {
        return reply
          .status(400)
          .send({ error: "Server must be running to spawn bots" });
      }

      const props = await readServerProperties(server.id);
      if (props["online-mode"] !== "false") {
        return reply.status(400).send({
          error:
            "Bots require offline-mode. Set online-mode=false in Access settings (and restart) — offline bots cannot join online-mode servers.",
        });
      }

      const parsed = spawnSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const compat = resolveBotClientVersion(server.mcVersion);
      if (compat.needsVia) {
        try {
          const via = await ensureViaForBots({
            serverDir: serverDir(server.id),
            type: server.type as ServerType,
            mcVersion: server.mcVersion,
          });
          if (!via.ready) {
            return reply.status(409).send({
              error: via.message,
              needsRestart: via.installed.length > 0,
              installed: via.installed,
              clientVersion: compat.clientVersion,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({
            error: `Could not prepare Via* for bots on ${server.mcVersion}: ${message}`,
          });
        }
      }

      try {
        const bots = await botManager.spawnBots(server.id, {
          port: server.port,
          mcVersion: server.mcVersion,
          count: parsed.data.count ?? DEFAULT_COUNT,
          prefix: parsed.data.prefix,
        });
        return reply.status(201).send({
          bots,
          clientVersion: compat.clientVersion,
          needsVia: compat.needsVia,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/servers/:id/bots",
    async (request, reply) => {
      const server = await prisma.server.findUnique({
        where: { id: request.params.id },
      });
      if (!server) return reply.status(404).send({ error: "Not found" });
      await botManager.stopBots(server.id);
      return { ok: true, bots: [] as const };
    },
  );

  app.post<{ Params: { id: string; name: string }; Body: unknown }>(
    "/api/servers/:id/bots/:name/command",
    async (request, reply) => {
      const server = await prisma.server.findUnique({
        where: { id: request.params.id },
      });
      if (!server) return reply.status(404).send({ error: "Not found" });

      const parsed = commandSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const target = request.params.name;
        if (target === "*" || target === "_all") {
          const bots = await botManager.runCommandOnAll(server.id, parsed.data);
          return { bots };
        }
        const bot = await botManager.runCommand(
          server.id,
          target,
          parsed.data,
        );
        return { bot };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
