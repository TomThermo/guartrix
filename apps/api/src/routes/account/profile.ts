import type { FastifyInstance } from "fastify";
import { requireSessionAuth } from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import {
  changeAccountPassword,
  changePasswordSchema,
  checkEmailAvailable,
  getAccountProfile,
  profilePatchSchema,
  suggestAddresses,
  updateAccountProfile,
} from "../../services/account-profile.js";
import { isServiceError } from "../../services/errors.js";

export function registerAccountProfileRoutes(app: FastifyInstance): void {
  app.get("/api/account/profile", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;
    try {
      return await getAccountProfile(user.id);
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });

  app.patch("/api/account/profile", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first =
        Object.values(flat.fieldErrors).flat()[0] || flat.formErrors[0] || "Invalid profile data";
      return reply.status(400).send({ error: first });
    }

    try {
      return await updateAccountProfile({ user, body: parsed.data, request });
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });

  /** Address autocomplete / check via OpenStreetMap Nominatim (server-side). */
  app.get("/api/account/address-suggest", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const q = String((request.query as { q?: string }).q ?? "");
    const country = String((request.query as { country?: string }).country ?? "");
    try {
      return await suggestAddresses({ q, country });
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });

  /** Live check whether an email can be claimed by this account. */
  app.get("/api/account/email-available", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const raw = String((request.query as { email?: string }).email ?? "");
    return checkEmailAvailable(user.id, raw);
  });

  app.post("/api/account/password", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first =
        flat.fieldErrors.confirmPassword?.[0] ||
        flat.fieldErrors.newPassword?.[0] ||
        flat.fieldErrors.currentPassword?.[0] ||
        flat.formErrors[0] ||
        "Invalid password data";
      return reply.status(400).send({ error: first });
    }

    try {
      return await changeAccountPassword({ user, body: parsed.data, request });
    } catch (err) {
      if (isServiceError(err)) return reply.status(err.status).send(err.toJSON());
      throw err;
    }
  });
}
