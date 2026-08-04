import type { FastifyInstance } from "fastify";
import {
  isAuthenticated,
  requireWrite,
} from "../auth.js";
import { registerServerDashboardRoutes } from "./servers-dashboard.js";
import { registerServerPlayerRoutes } from "./servers-players.js";
import { registerServerAddonRoutes } from "./servers-addons.js";
import { registerServerPowerRoutes } from "./servers-power.js";
import { registerServerWorldRoutes } from "./servers-world.js";
import { registerServerSettingsRoutes } from "./servers-settings.js";
import { registerServerCrudRoutes } from "./servers-crud.js";
import { registerServerTransferRoutes } from "./servers-transfer.js";

export function registerServerRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.startsWith("/api/servers") && !pathOnly.startsWith("/api/versions")) {
      return;
    }
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (!(await requireWrite(request, reply))) return;
    }
  });

  registerServerPlayerRoutes(app);
  registerServerDashboardRoutes(app);
  registerServerAddonRoutes(app);
  registerServerPowerRoutes(app);
  registerServerWorldRoutes(app);
  registerServerSettingsRoutes(app);
  registerServerCrudRoutes(app);
  registerServerTransferRoutes(app);
}
