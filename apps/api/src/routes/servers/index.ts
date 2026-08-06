import type { FastifyInstance } from "fastify";
import { isAuthenticated, requireWrite } from "../../auth/auth.js";
import { registerServerAddonRoutes } from "./addons.js";
import { registerAllocationRoutes } from "./allocations.js";
import { registerBackupRoutes } from "./backups.js";
import { registerBotRoutes } from "./bots.js";
import { registerServerCrudRoutes } from "./crud.js";
import { registerServerDashboardRoutes } from "./dashboard.js";
import { registerDatabaseRoutes } from "./databases.js";
import { registerFileRoutes } from "./files.js";
import { registerIconRoutes } from "./icon.js";
import { registerImportRoutes } from "./import.js";
import { registerLogRoutes } from "./logs.js";
import { registerPlayerActionRoutes } from "./player-actions.js";
import { registerServerPlayerRoutes } from "./players.js";
import { registerServerPowerRoutes } from "./power.js";
import { registerResourcePackRoutes } from "./resource-pack.js";
import { registerServerSettingsRoutes } from "./settings.js";
import { registerSubUserRoutes } from "./subusers.js";
import { registerTaskRoutes } from "./tasks.js";
import { registerServerTransferRoutes } from "./transfer.js";
import { registerServerWorldRoutes } from "./world.js";

/**
 * Client API under `/api/servers/*` and `/api/versions`.
 * One domain per file in this folder for overview.
 */
export function registerServerRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0] ?? "";
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
  registerFileRoutes(app);
  registerBackupRoutes(app);
  registerDatabaseRoutes(app);
  registerAllocationRoutes(app);
  registerSubUserRoutes(app);
  registerImportRoutes(app);
  registerPlayerActionRoutes(app);
  registerIconRoutes(app);
  registerBotRoutes(app);
  registerTaskRoutes(app);
  registerLogRoutes(app);
  registerResourcePackRoutes(app);
}

export {
  registerAllocationRoutes,
  registerBackupRoutes,
  registerBotRoutes,
  registerDatabaseRoutes,
  registerFileRoutes,
  registerIconRoutes,
  registerImportRoutes,
  registerLogRoutes,
  registerPlayerActionRoutes,
  registerResourcePackRoutes,
  registerSubUserRoutes,
  registerTaskRoutes,
};
