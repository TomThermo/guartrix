import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../auth/auth.js";
import { logActivity } from "../activity-log.js";
import { serverDir } from "../config.js";
import {
  addIpBan,
  addOp,
  addPlayerBan,
  addWhitelist,
  readBans,
  readPlayers,
  removeIpBan,
  removeOp,
  removePlayerBan,
  removeWhitelist,
  updateIpBan,
  updatePlayerBan,
} from "../servers/players.js";
import { fixDataOwnership } from "../servers/process-manager.js";

/** Player whitelist / ops / bans routes (split from servers.ts). */
export function registerServerPlayerRoutes(app: FastifyInstance): void {
app.get<{ Params: { id: string } }>("/api/servers/:id/players", async (request, reply) => {
  const access = await requireServerAccess(request, reply, request.params.id, {
    permission: "player.read",
  });
  if (!access) return;
  return readPlayers(access.server.id);
});

app.post<{ Params: { id: string }; Body: { name?: string } }>(
  "/api/servers/:id/whitelist",
  async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    const name = request.body?.name?.trim();
    if (!name) return reply.status(400).send({ error: "name is required" });
    try {
      const result = await addWhitelist(
        access.server.id,
        serverDir(access.server.id),
        name,
      );
      logActivity({
        action: "player.whitelist-add",
        request,
        user: access.user,
        server: access.server,
        metadata: { player: name },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  },
);

app.delete<{ Params: { id: string; name: string } }>(
  "/api/servers/:id/whitelist/:name",
  async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    try {
      const player = decodeURIComponent(request.params.name);
      const result = await removeWhitelist(
        access.server.id,
        serverDir(access.server.id),
        player,
      );
      logActivity({
        action: "player.whitelist-remove",
        request,
        user: access.user,
        server: access.server,
        metadata: { player },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  },
);

app.post<{ Params: { id: string }; Body: { name?: string; level?: number } }>(
  "/api/servers/:id/ops",
  async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    const name = request.body?.name?.trim();
    if (!name) return reply.status(400).send({ error: "name is required" });
    try {
      const level = request.body?.level ?? 4;
      const result = await addOp(
        access.server.id,
        serverDir(access.server.id),
        name,
        level,
      );
      logActivity({
        action: "player.op",
        request,
        user: access.user,
        server: access.server,
        metadata: { player: name, level },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  },
);

app.delete<{ Params: { id: string; name: string } }>(
  "/api/servers/:id/ops/:name",
  async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    try {
      const player = decodeURIComponent(request.params.name);
      const result = await removeOp(
        access.server.id,
        serverDir(access.server.id),
        player,
      );
      logActivity({
        action: "player.deop",
        request,
        user: access.user,
        server: access.server,
        metadata: { player },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  },
);

app.get<{ Params: { id: string } }>("/api/servers/:id/bans", async (request, reply) => {
  const access = await requireServerAccess(request, reply, request.params.id, {
    permission: "player.read",
  });
  if (!access) return;
  return readBans(access.server.id);
});

app.post<{
  Params: { id: string };
  Body: { name?: string; reason?: string; expires?: string };
}>("/api/servers/:id/bans/players", async (request, reply) => {
  const access = await requireServerAccess(request, reply, request.params.id, {
    permission: "player.update",
  });
  if (!access) return;
  const name = request.body?.name?.trim();
  if (!name) return reply.status(400).send({ error: "name is required" });
  try {
    await fixDataOwnership(serverDir(access.server.id));
    const result = await addPlayerBan(
      access.server.id,
      serverDir(access.server.id),
      name,
      request.body?.reason,
      request.body?.expires,
    );
    logActivity({
      action: "player.ban",
      request,
      user: access.user,
      server: access.server,
      metadata: {
        player: name,
        reason: request.body?.reason,
        expires: request.body?.expires,
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(400).send({ error: message });
  }
});

app.patch<{
  Params: { id: string; name: string };
  Body: { reason?: string; expires?: string };
}>("/api/servers/:id/bans/players/:name", async (request, reply) => {
  const access = await requireServerAccess(request, reply, request.params.id, {
    permission: "player.update",
  });
  if (!access) return;
  try {
    await fixDataOwnership(serverDir(access.server.id));
    return await updatePlayerBan(
      access.server.id,
      serverDir(access.server.id),
      decodeURIComponent(request.params.name),
      {
        reason: request.body?.reason,
        expires: request.body?.expires,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(400).send({ error: message });
  }
});

app.delete<{ Params: { id: string; name: string } }>(
  "/api/servers/:id/bans/players/:name",
  async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    try {
      await fixDataOwnership(serverDir(access.server.id));
      const player = decodeURIComponent(request.params.name);
      const result = await removePlayerBan(
        access.server.id,
        serverDir(access.server.id),
        player,
      );
      logActivity({
        action: "player.unban",
        request,
        user: access.user,
        server: access.server,
        metadata: { player },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  },
);

app.post<{
  Params: { id: string };
  Body: { ip?: string; reason?: string; expires?: string };
}>("/api/servers/:id/bans/ips", async (request, reply) => {
  const access = await requireServerAccess(request, reply, request.params.id, {
    permission: "player.update",
  });
  if (!access) return;
  const ip = request.body?.ip?.trim();
  if (!ip) return reply.status(400).send({ error: "ip is required" });
  try {
    await fixDataOwnership(serverDir(access.server.id));
    const result = await addIpBan(
      access.server.id,
      serverDir(access.server.id),
      ip,
      request.body?.reason,
      request.body?.expires,
    );
    logActivity({
      action: "player.ban",
      request,
      user: access.user,
      server: access.server,
      metadata: {
        ip,
        reason: request.body?.reason,
        expires: request.body?.expires,
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(400).send({ error: message });
  }
});

app.patch<{
  Params: { id: string; ip: string };
  Body: { reason?: string; expires?: string };
}>("/api/servers/:id/bans/ips/:ip", async (request, reply) => {
  const access = await requireServerAccess(request, reply, request.params.id, {
    permission: "player.update",
  });
  if (!access) return;
  try {
    await fixDataOwnership(serverDir(access.server.id));
    return await updateIpBan(
      access.server.id,
      serverDir(access.server.id),
      decodeURIComponent(request.params.ip),
      {
        reason: request.body?.reason,
        expires: request.body?.expires,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(400).send({ error: message });
  }
});

app.delete<{ Params: { id: string; ip: string } }>(
  "/api/servers/:id/bans/ips/:ip",
  async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    try {
      await fixDataOwnership(serverDir(access.server.id));
      const ip = decodeURIComponent(request.params.ip);
      const result = await removeIpBan(
        access.server.id,
        serverDir(access.server.id),
        ip,
      );
      logActivity({
        action: "player.unban",
        request,
        user: access.user,
        server: access.server,
        metadata: { ip },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  },
);
}
