import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { APPLICATION_API_KEY_MAX, normalizeApplicationScopes } from "@guartrix/shared";
import { generateApplicationToken, toApplicationKeyRecord } from "../../auth/application-keys.js";
import { requireAdmin } from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { logActivity } from "../../activity-log.js";
import { countApplicationApiKeys, createApplicationApiKey, findApplicationApiKey, findManyApplicationApiKeys, updateApplicationApiKey } from "../../repositories/application.js";

/** Admin session routes for managing Application API keys. */
export function registerApplicationKeyAdminRoutes(app: FastifyInstance): void {
  app.get("/api/admin/application-keys", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const rows = await findManyApplicationApiKeys({
      orderBy: { createdAt: "desc" },
    });
    return {
      keys: rows.map(toApplicationKeyRecord),
      maxKeys: APPLICATION_API_KEY_MAX,
    };
  });

  app.post("/api/admin/application-keys", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAdmin(request, reply);
    if (!user) return;

    const parsed = z
      .object({
        name: z.string().trim().min(1).max(64),
        scopes: z.array(z.string()).min(1).max(32),
        note: z.string().max(200).nullable().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const scopes = normalizeApplicationScopes(parsed.data.scopes);
    if (!scopes) {
      return reply.status(400).send({
        error: 'scopes must be known Application API scopes, or ["*"]',
      });
    }

    const active = await countApplicationApiKeys({
      where: { revokedAt: null },
    });
    if (active >= APPLICATION_API_KEY_MAX) {
      return reply.status(400).send({
        error: `At most ${APPLICATION_API_KEY_MAX} active Application API keys`,
      });
    }

    const { token, prefix, tokenHash } = generateApplicationToken();
    const row = await createApplicationApiKey({
      data: {
        id: nanoid(12),
        name: parsed.data.name,
        prefix,
        tokenHash,
        scopes: JSON.stringify(scopes),
        note: parsed.data.note?.trim() || null,
      },
    });

    logActivity({
      action: "application-key.create",
      request,
      user,
      metadata: { keyId: row.id, name: row.name, prefix, scopes },
    });

    return reply.status(201).send({
      key: toApplicationKeyRecord(row),
      token,
    });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/admin/application-keys/:id",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireAdmin(request, reply);
      if (!user) return;

      const row = await findApplicationApiKey({
        where: { id: request.params.id },
      });
      if (!row) return reply.status(404).send({ error: "Key not found" });
      if (row.revokedAt) {
        return reply.status(400).send({ error: "Already revoked" });
      }
      const updated = await updateApplicationApiKey({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      logActivity({
        action: "application-key.revoke",
        request,
        user,
        metadata: { keyId: row.id, name: row.name, prefix: row.prefix },
      });
      return { key: toApplicationKeyRecord(updated) };
    },
  );
}
