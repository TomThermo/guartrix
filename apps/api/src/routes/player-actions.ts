import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../activity-log.js";
import { requireServerAccess } from "../auth.js";
import { listModerationEvents, recordModerationEvent } from "../moderation.js";
import { processManager } from "../process-manager.js";

const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/;
const ITEM_ID = /^[a-z0-9_.:]+$/i;
const GAMEMODES = new Set(["survival", "creative", "adventure", "spectator", "0", "1", "2", "3"]);

const actionSchema = z.object({
  action: z.enum([
    "kick",
    "ban",
    "pardon",
    "op",
    "deop",
    "whisper",
    "give",
    "gamemode",
    "kill",
    "clear",
    "whitelist_add",
    "whitelist_remove",
  ]),
  name: z.string().min(3).max(16),
  reason: z.string().max(100).optional(),
  message: z.string().max(256).optional(),
  item: z.string().max(64).optional(),
  count: z.number().int().min(1).max(2304).optional(),
  gamemode: z.string().max(16).optional(),
});

const ACTIVITY_ACTION_BY_PLAYER_ACTION: Record<string, string> = {
  kick: "player.kick",
  ban: "player.ban",
  pardon: "player.unban",
  op: "player.op",
  deop: "player.deop",
  whitelist_add: "player.whitelist-add",
  whitelist_remove: "player.whitelist-remove",
};

function sanitizeText(text: string): string {
  return text.replace(/[\r\n;&|`$<>\\]/g, " ").trim();
}

function buildCommand(data: z.infer<typeof actionSchema>): string {
  const name = data.name.trim();
  if (!PLAYER_NAME.test(name)) {
    throw new Error("Invalid player name");
  }

  switch (data.action) {
    case "kick": {
      const reason = sanitizeText(data.reason ?? "");
      return reason ? `kick ${name} ${reason}` : `kick ${name}`;
    }
    case "ban": {
      const reason = sanitizeText(data.reason ?? "");
      return reason ? `ban ${name} ${reason}` : `ban ${name}`;
    }
    case "pardon":
      return `pardon ${name}`;
    case "op":
      return `op ${name}`;
    case "deop":
      return `deop ${name}`;
    case "whisper": {
      const message = sanitizeText(data.message ?? "");
      if (!message) throw new Error("Message is required");
      return `msg ${name} ${message}`;
    }
    case "give": {
      let item = (data.item ?? "").trim().toLowerCase();
      if (!item) throw new Error("Item is required");
      if (!item.includes(":")) item = `minecraft:${item}`;
      if (!ITEM_ID.test(item)) throw new Error("Invalid item id");
      const count = data.count ?? 1;
      return `give ${name} ${item} ${count}`;
    }
    case "gamemode": {
      const mode = (data.gamemode ?? "").trim().toLowerCase();
      if (!GAMEMODES.has(mode)) throw new Error("Invalid gamemode");
      return `gamemode ${mode} ${name}`;
    }
    case "kill":
      return `kill ${name}`;
    case "clear":
      return `clear ${name}`;
    case "whitelist_add":
      return `whitelist add ${name}`;
    case "whitelist_remove":
      return `whitelist remove ${name}`;
    default:
      throw new Error("Unknown action");
  }
}

export function registerPlayerActionRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/players/action",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;

      const parsed = actionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      if (!processManager.isRunning(access.server.id)) {
        return reply.status(409).send({ error: "Server is not running" });
      }

      try {
        const command = buildCommand(parsed.data);
        processManager.sendCommand(access.server.id, command);
        const activityAction =
          ACTIVITY_ACTION_BY_PLAYER_ACTION[parsed.data.action] ?? "player.action";
        logActivity({
          action: activityAction,
          request,
          user: access.user,
          server: access.server,
          metadata: {
            player: parsed.data.name,
            playerAction: parsed.data.action,
            reason: parsed.data.reason,
          },
        });
        if (ACTIVITY_ACTION_BY_PLAYER_ACTION[parsed.data.action]) {
          void recordModerationEvent({
            serverId: access.server.id,
            playerName: parsed.data.name,
            action: parsed.data.action,
            reason: parsed.data.reason,
            actorUserId: access.user.id,
          });
        }
        return {
          ok: true,
          command,
          action: parsed.data.action,
          name: parsed.data.name,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { player?: string; limit?: string };
  }>("/api/servers/:id/players/moderation", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.read",
    });
    if (!access) return;
    const limit = request.query.limit ? Number(request.query.limit) : 50;
    return {
      events: await listModerationEvents(access.server.id, {
        playerName: request.query.player?.trim() || undefined,
        limit: Number.isFinite(limit) ? limit : 50,
      }),
    };
  });
}
