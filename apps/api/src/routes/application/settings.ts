import type { FastifyInstance } from "fastify";
import { requireApplication } from "../../auth/application-auth.js";

export function registerApplicationSettingsRoutes(app: FastifyInstance): void {
  app.get("/api/application/settings", async (request, reply) => {
    if (!(await requireApplication(request, reply, "settings.read"))) return;
    const { getPanelSettingsView } = await import("../../panel-settings.js");
    const view = await getPanelSettingsView();
    return {
      publicHost: view.publicHost,
      publicBaseUrl: view.publicBaseUrl,
      registrationEnabled: view.registrationEnabled,
      defaultMaxServers: view.defaultMaxServers,
      defaultMaxMemoryMb: view.defaultMaxMemoryMb,
      defaultMaxDatabases: view.defaultMaxDatabases,
    };
  });
}
