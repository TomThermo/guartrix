import type { FastifyInstance } from "fastify";
import type { ServerType } from "@msm/shared";
import { addonKindFor, hasPermission } from "@msm/shared";
import { getSessionUser } from "../../auth/auth.js";
import {
  getServerPermissionsBatch,
  listVisibleServerIds,
  listVisibleServers,
  countVisibleServers,
} from "../../servers/server-access.js";
import { checkInstalledAddonUpdates } from "../../servers/addons.js";
import { serverDir } from "../../config.js";
import { getAllOnlinePlayers } from "../../servers/online-players.js";
import { processManager } from "../../servers/process-manager.js";
import { toMcServer } from "../../servers/serialize.js";
import { emptyServerStats } from "../../servers/stats.js";
import { checkAllServerUpdates } from "../../servers/updates.js";

type AddonUpdateCacheEntry = {
  available: number;
  expiresAt: number;
  fingerprint: string;
};

const addonUpdateCache = new Map<string, AddonUpdateCacheEntry>();
const ADDON_UPDATE_TTL_MS = 3 * 60_000;

function addonFingerprint(s: {
  type: string;
  mcVersion: string;
  updatedAt?: Date | string | null;
}): string {
  const updated =
    s.updatedAt instanceof Date ? s.updatedAt.toISOString() : String(s.updatedAt ?? "");
  return `${s.type}|${s.mcVersion}|${updated}`;
}

/**
 * Dashboard list/bulk endpoints extracted from servers.ts so the hot poll path
 * stays small and easy to optimize.
 */
export function registerServerDashboardRoutes(app: FastifyInstance): void {
  app.get("/api/servers", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) {
      const { apiKeyRateLimitedMessage } = await import("../../auth/api-keys.js");
      const rate = apiKeyRateLimitedMessage(request);
      if (rate) return reply.status(429).send({ error: rate });
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const q = (request.query ?? {}) as Record<string, unknown>;
    const paged =
      q.limit != null ||
      q.offset != null ||
      q.page != null ||
      q.paged === "1" ||
      q.paged === "true";

    const limit = paged
      ? Math.min(
          500,
          Math.max(1, Math.floor(Number.isFinite(Number(q.limit)) ? Number(q.limit) : 100)),
        )
      : // Safety cap for legacy array responses on large installs
        user.role === "ADMIN"
        ? 500
        : undefined;
    const offset = paged
      ? q.offset != null && Number.isFinite(Number(q.offset))
        ? Math.max(0, Math.floor(Number(q.offset)))
        : q.page != null && Number.isFinite(Number(q.page))
          ? Math.max(0, (Math.floor(Number(q.page)) - 1) * limit!)
          : 0
      : 0;

    const opts = {
      limit,
      offset: paged || limit != null ? offset : undefined,
      nodeId: typeof q.nodeId === "string" ? q.nodeId : undefined,
      status: typeof q.status === "string" ? q.status : undefined,
      q: typeof q.q === "string" ? q.q : undefined,
    };

    const [servers, total] = await Promise.all([
      listVisibleServers(user, request, opts),
      countVisibleServers(user, request, {
        nodeId: opts.nodeId,
        status: opts.status,
        q: opts.q,
      }),
    ]);
    const perms = await getServerPermissionsBatch(
      user,
      servers.map((s) => ({ id: s.id, ownerId: s.ownerId })),
    );
    const mapped = servers.map((server) => ({
      ...toMcServer(server),
      permissions: perms.get(server.id) ?? [],
    }));

    void reply.header("x-total-count", String(total));
    if (limit != null) void reply.header("x-limit", String(limit));
    if (paged) {
      return {
        servers: mapped,
        total,
        limit: limit ?? mapped.length,
        offset,
      };
    }
    return mapped;
  });

  app.get("/api/servers/stats", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ids = await listVisibleServerIds(user, request);
    const cached = processManager.getAllCachedStats();
    // Cache-only under dashboard load — never fan out collectServerStats here.
    const entries = ids.map((id) => {
      if (cached[id]) return [id, cached[id]] as const;
      return [id, emptyServerStats(id)] as const;
    });
    return Object.fromEntries(entries);
  });

  app.get("/api/servers/online", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ids = await listVisibleServerIds(user, request);
    return getAllOnlinePlayers(ids);
  });

  app.get("/api/servers/updates", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ids = await listVisibleServerIds(user, request);
    return checkAllServerUpdates(ids);
  });

  app.get("/api/servers/addon-updates", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const servers = await listVisibleServers(user, request);
    const eligible = servers.filter((s) => addonKindFor(s.type as ServerType));
    const perms = await getServerPermissionsBatch(
      user,
      eligible.map((s) => ({ id: s.id, ownerId: s.ownerId })),
    );

    const out: Record<string, { available: number }> = {};
    const now = Date.now();
    const needFetch: typeof eligible = [];

    for (const s of eligible) {
      const granted = perms.get(s.id) ?? [];
      if (!hasPermission(granted, "addon.read")) continue;
      const fingerprint = addonFingerprint(s);
      const hit = addonUpdateCache.get(s.id);
      if (hit && hit.expiresAt > now && hit.fingerprint === fingerprint) {
        out[s.id] = { available: hit.available };
      } else {
        needFetch.push(s);
      }
    }

    let next = 0;
    const workers = Array.from({ length: Math.min(2, Math.max(needFetch.length, 0)) }, async () => {
      while (next < needFetch.length) {
        const i = next++;
        const s = needFetch[i]!;
        const fingerprint = addonFingerprint(s);
        try {
          const updates = await checkInstalledAddonUpdates({
            serverDir: serverDir(s.id),
            type: s.type as ServerType,
            mcVersion: s.mcVersion,
          });
          const available = updates.filter((u) => u.available).length;
          out[s.id] = { available };
          addonUpdateCache.set(s.id, {
            available,
            fingerprint,
            expiresAt: Date.now() + ADDON_UPDATE_TTL_MS,
          });
        } catch {
          out[s.id] = { available: 0 };
          addonUpdateCache.set(s.id, {
            available: 0,
            fingerprint,
            expiresAt: Date.now() + Math.min(60_000, ADDON_UPDATE_TTL_MS),
          });
        }
      }
    });
    await Promise.all(workers);
    return out;
  });
}

/** Test helper / optional: clear addon update cache (e.g. after install). */
export function invalidateAddonUpdateCache(serverId?: string): void {
  if (!serverId) {
    addonUpdateCache.clear();
    return;
  }
  addonUpdateCache.delete(serverId);
}
