import type { FastifyInstance } from "fastify";
import type { ServerType } from "@msm/shared";
import { addonKindFor, hasPermission } from "@msm/shared";
import {
  getSessionUser,
  listVisibleServerIds,
  listVisibleServers,
} from "../auth.js";
import { getServerPermissionsBatch } from "../server-access.js";
import { checkInstalledAddonUpdates } from "../addons.js";
import { serverDir } from "../config.js";
import { getAllOnlinePlayers } from "../online-players.js";
import { processManager } from "../process-manager.js";
import { toMcServer } from "../serialize.js";
import { emptyServerStats } from "../stats.js";
import { checkAllServerUpdates } from "../updates.js";

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
    s.updatedAt instanceof Date
      ? s.updatedAt.toISOString()
      : String(s.updatedAt ?? "");
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
      const { apiKeyRateLimitedMessage } = await import("../api-keys.js");
      const rate = apiKeyRateLimitedMessage(request);
      if (rate) return reply.status(429).send({ error: rate });
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const servers = await listVisibleServers(user, request);
    const perms = await getServerPermissionsBatch(
      user,
      servers.map((s) => ({ id: s.id, ownerId: s.ownerId })),
    );
    return servers.map((server) => ({
      ...toMcServer(server),
      permissions: perms.get(server.id) ?? [],
    }));
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
    const workers = Array.from(
      { length: Math.min(2, Math.max(needFetch.length, 0)) },
      async () => {
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
      },
    );
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
