import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  API_KEY_MAX_PER_USER,
  normalizeAdminPanelScopes,
  normalizeApiKeyPermissions,
} from "@guartrix/shared";
import { logActivity } from "../../activity-log.js";
import { generateApiKeyToken, toApiKeyRecord } from "../../auth/api-keys.js";
import { requireSessionAuth } from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { countApiKeys, createApiKey, findFirstApiKey, findManyApiKeys, updateApiKey } from "../../services/account.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  permissions: z.array(z.string()).min(1).max(64),
  serverIds: z.array(z.string().min(1).max(64)).max(100).nullable().optional(),
  adminScopes: z.array(z.string()).max(32).nullable().optional(),
});

export function registerApiKeyRoutes(app: FastifyInstance): void {
  app.get("/api/account/api-keys", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const rows = await findManyApiKeys({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return {
      keys: rows.map(toApiKeyRecord),
      maxKeys: API_KEY_MAX_PER_USER,
    };
  });

  app.post("/api/account/api-keys", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    if (user.twoFactorRequired && !user.twoFactorEnabled) {
      return reply.status(403).send({
        error:
          "Enable two-factor authentication under Account → Security before creating API keys.",
        code: "TWO_FACTOR_REQUIRED",
      });
    }

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const permissions = normalizeApiKeyPermissions(parsed.data.permissions);
    if (!permissions) {
      return reply.status(400).send({
        error: 'permissions must be a non-empty list of known permission keys, or ["*"]',
      });
    }

    let adminScopes: string[] | null = null;
    if (parsed.data.adminScopes != null) {
      if (user.role !== "ADMIN") {
        return reply.status(403).send({
          error: "Only ADMIN accounts can grant panel admin scopes on API keys",
        });
      }
      const normalized = normalizeAdminPanelScopes(parsed.data.adminScopes);
      if (!normalized) {
        return reply.status(400).send({
          error: 'adminScopes must be known panel admin scopes, or ["*"]',
        });
      }
      adminScopes = normalized;
    }

    let serverIds: string[] | null = null;
    if (parsed.data.serverIds != null) {
      if (parsed.data.serverIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "serverIds cannot be empty — omit for all servers" });
      }
      // Only allow servers this user can already access.
      const { listVisibleServerIds } = await import("../../auth/auth.js");
      const visible = new Set(await listVisibleServerIds(user));
      for (const id of parsed.data.serverIds) {
        if (!visible.has(id)) {
          return reply.status(400).send({ error: `Unknown or inaccessible server: ${id}` });
        }
      }
      serverIds = [...new Set(parsed.data.serverIds)];
    }

    const active = await countApiKeys({
      where: { userId: user.id, revokedAt: null },
    });
    if (active >= API_KEY_MAX_PER_USER) {
      return reply.status(400).send({
        error: `You can have at most ${API_KEY_MAX_PER_USER} active API keys — revoke one first`,
      });
    }

    const { token, prefix, tokenHash } = generateApiKeyToken();
    const row = await createApiKey({
      data: {
        id: nanoid(12),
        userId: user.id,
        name: parsed.data.name,
        prefix,
        tokenHash,
        permissions: JSON.stringify(permissions),
        serverIds: serverIds ? JSON.stringify(serverIds) : null,
        adminScopes: adminScopes ? JSON.stringify(adminScopes) : null,
      },
    });

    logActivity({
      action: "api-key.create",
      request,
      user,
      metadata: {
        keyId: row.id,
        name: row.name,
        prefix,
        permissions,
        serverCount: serverIds?.length ?? null,
      },
    });

    return reply.status(201).send({
      key: toApiKeyRecord(row),
      token,
    });
  });

  app.delete<{ Params: { id: string } }>("/api/account/api-keys/:id", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const row = await findFirstApiKey({
      where: { id: request.params.id, userId: user.id },
    });
    if (!row) {
      return reply.status(404).send({ error: "API key not found" });
    }
    if (row.revokedAt) {
      return reply.status(400).send({ error: "API key is already revoked" });
    }

    const updated = await updateApiKey({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    logActivity({
      action: "api-key.revoke",
      request,
      user,
      metadata: { keyId: row.id, name: row.name, prefix: row.prefix },
    });

    return { key: toApiKeyRecord(updated) };
  });
}
