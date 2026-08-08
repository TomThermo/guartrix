import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../../auth/auth.js";
import { sendZodError } from "../../http-error.js";
import { applyServerSettingsPatch } from "./settings/apply.js";
import { assertSettingsPatchAccess } from "./settings/guards.js";
import { updateSchema } from "./settings/schemas.js";
import { validateAndNormalizeSettingsPatch } from "./settings/validate.js";

/** PATCH /api/servers/:id — core server settings. */
export function registerServerSettingsRoutes(app: FastifyInstance): void {
  app.patch<{ Params: { id: string } }>("/api/servers/:id", async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
    }

    const access = await requireServerAccess(request, reply, request.params.id);
    if (!access) return;
    const data = parsed.data;

    if (!(await assertSettingsPatchAccess(request, reply, access, data))) return;

    const fields = await validateAndNormalizeSettingsPatch(reply, access.server, data);
    if (!fields) return;

    return applyServerSettingsPatch(request, reply, access, data, fields);
  });
}
