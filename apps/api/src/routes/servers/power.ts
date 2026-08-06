import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireServerAccess } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { config } from "../../config.js";
import { processManager } from "../../servers/process-manager.js";
import { hasServerPermission } from "../../servers/server-access.js";
import {
  performServerPower,
  POWER_PERMISSION,
  type PowerSignal,
} from "../../servers/power-actions.js";

function sendPowerResult(
  reply: import("fastify").FastifyReply,
  result: Awaited<ReturnType<typeof performServerPower>>,
) {
  if (!result.ok) {
    return reply.status(result.status).send({
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
    });
  }
  return result.server;
}

/** Start / stop / kill / restart routes (split from servers.ts). */
export function registerServerPowerRoutes(app: FastifyInstance): void {
  const runPower = async (
    request: import("fastify").FastifyRequest<{ Params: { id: string } }>,
    reply: import("fastify").FastifyReply,
    signal: PowerSignal,
  ) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: POWER_PERMISSION[signal],
    });
    if (!access) return;
    const result = await performServerPower({
      server: access.server,
      signal,
      user: access.user,
      request,
    });
    return sendPowerResult(reply, result);
  };

  app.post<{ Params: { id: string } }>("/api/servers/:id/start", (req, reply) =>
    runPower(req, reply, "start"),
  );
  app.post<{ Params: { id: string } }>("/api/servers/:id/stop", (req, reply) =>
    runPower(req, reply, "stop"),
  );
  app.post<{ Params: { id: string } }>("/api/servers/:id/kill", (req, reply) =>
    runPower(req, reply, "kill"),
  );
  app.post<{ Params: { id: string } }>("/api/servers/:id/restart", (req, reply) =>
    runPower(req, reply, "restart"),
  );

  /** Pterodactyl-style unified power signal (start | stop | restart | kill). */
  app.post<{ Params: { id: string } }>("/api/servers/:id/power", async (request, reply) => {
    const parsed = z
      .object({
        signal: z.enum(["start", "stop", "restart", "kill"]),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    return runPower(request, reply, parsed.data.signal);
  });

  /** Send a console command over HTTP and return captured output lines. */
  app.post<{ Params: { id: string } }>("/api/servers/:id/command", async (request, reply) => {
    const parsed = z
      .object({
        command: z.string().trim().min(1).max(512),
        /** How long to wait for console output (ms). Default 2500, max 15000. */
        timeoutMs: z.number().int().min(200).max(15_000).optional(),
        /** Quiet period after last line before returning (ms). Default 450. */
        idleMs: z.number().int().min(50).max(5_000).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.console",
    });
    if (!access) return;

    const cmd = parsed.data.command;
    const primary = cmd.split(/\s+/)[0]?.toLowerCase() ?? "";
    if ((primary === "stop" || primary === "end") && !hasServerPermission(access, "control.stop")) {
      return reply.status(403).send({ error: "Missing permission: control.stop" });
    }
    if (primary === "restart" && !hasServerPermission(access, "control.restart")) {
      return reply.status(403).send({ error: "Missing permission: control.restart" });
    }

    if (!processManager.isRunning(access.server.id)) {
      return reply.status(409).send({ error: "Server is not running" });
    }

    try {
      const collected = await processManager.runCommandAndCollect(
        access.server.id,
        cmd,
        {
          timeoutMs: parsed.data.timeoutMs,
          idleMs: parsed.data.idleMs,
        },
      );
      logActivity({
        action: "console.command",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          command: cmd,
          via: "http",
          lineCount: collected.lines.length,
          timedOut: collected.timedOut,
        },
      });
      return {
        ok: true,
        command: cmd,
        lines: collected.lines,
        output: collected.lines.join("\n"),
        timedOut: collected.timedOut,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  /** WebSocket connection info for API clients (Bearer auth on upgrade). */
  app.get<{ Params: { id: string } }>("/api/servers/:id/websocket", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.console.read",
    });
    if (!access) return;

    const proto =
      request.headers["x-forwarded-proto"] === "https" ||
      request.protocol === "https"
        ? "wss"
        : "ws";
    const host = request.headers.host ?? config.publicHost;
    const base = `${proto}://${host}`;

    return {
      socket: `${base}/ws/servers/${access.server.id}/console`,
      players: `${base}/ws/servers/${access.server.id}/players`,
      auth: "Authorization: Bearer gt_… on the WebSocket upgrade request",
      send: { type: "command", command: "say Hello" },
      events: ["history", "output", "status", "stats", "error"],
      permissions: {
        read: hasServerPermission(access, "control.console.read"),
        send: hasServerPermission(access, "control.console"),
      },
    };
  });
}
