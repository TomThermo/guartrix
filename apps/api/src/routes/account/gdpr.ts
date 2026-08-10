import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { deleteAccount, exportAccountData } from "../../services/account-gdpr.js";
import { isServiceError } from "../../services/errors.js";

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
  confirm: z.literal("DELETE"),
});

/**
 * GDPR self-service: export personal data + delete account.
 */
export function registerAccountGdprRoutes(app: FastifyInstance): void {
  app.get("/api/account/export", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    try {
      const { filename, body } = await exportAccountData({ user, request });
      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(body);
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });

  app.delete("/api/account", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const me = await requireAuth(request, reply);
    if (!me) return;

    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Provide password and confirm: "DELETE"',
      });
    }

    try {
      await deleteAccount({ user: me, password: parsed.data.password, request });
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }

    try {
      await request.session.destroy();
    } catch {
      // already gone
    }

    return { ok: true };
  });
}
