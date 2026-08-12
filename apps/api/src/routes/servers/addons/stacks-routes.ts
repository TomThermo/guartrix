import type { FastifyInstance } from "fastify";
import type { ServerType } from "@guartrix/shared";
import { requireServerAccess } from "../../../auth/auth.js";
import { logActivity } from "../../../activity-log.js";
import { installAddon } from "../../../servers/addons.js";
import { resolveLocalServerDataDir } from "../../../servers/server-data-path.js";
import { fixDataOwnership } from "../../../servers/process-manager.js";

/** Recommended plugin-stack install route. */
export function registerAddonStacksRoutes(app: FastifyInstance): void {
  app.post<{
    Params: { id: string };
    Body: { stackId?: string };
  }>("/api/servers/:id/addon-stacks", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.update",
    });
    if (!access) return;
    const { RECOMMENDED_PLUGIN_STACKS, addonKindFor } = await import("@guartrix/shared");
    if (addonKindFor(access.server.type as ServerType) !== "plugin") {
      return reply.status(400).send({ error: "Recommended stacks are only for Paper/Purpur" });
    }
    const stack = RECOMMENDED_PLUGIN_STACKS.find((s) => s.id === request.body?.stackId);
    if (!stack) return reply.status(404).send({ error: "Unknown stack" });

    const installed: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];
    const dir = await resolveLocalServerDataDir(access.server.id);
    await fixDataOwnership(dir);
    for (const item of stack.items) {
      try {
        await installAddon({
          serverDir: dir,
          type: access.server.type as ServerType,
          mcVersion: access.server.mcVersion,
          projectId: item.projectId,
          versionId: item.versionId,
        });
        installed.push(item.name);
      } catch (err) {
        errors.push({
          name: item.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logActivity({
      action: "addon.install",
      request,
      user: access.user,
      server: access.server,
      metadata: { stackId: stack.id, installed, errors },
    });
    return { stackId: stack.id, installed, errors };
  });
}
