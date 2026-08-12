import type { FastifyInstance } from "fastify";
import { registerApplicationUserRoutes } from "./users.js";
import { registerApplicationServerCoreRoutes } from "./servers-core.js";
import { registerApplicationNodeRoutes } from "./nodes.js";
import { registerApplicationStorageRoutes } from "./storages.js";
import { registerApplicationActivityRoutes } from "./activity.js";
import { registerApplicationSettingsRoutes } from "./settings.js";
import { registerApplicationServerFilesRoutes } from "./servers-files.js";
import { registerApplicationServerAddonsRoutes } from "./servers-addons.js";
import { registerApplicationServerBackupsRoutes } from "./servers-backups.js";
import { registerApplicationServerAllocationsRoutes } from "./servers-allocations.js";
import { registerApplicationServerDatabasesRoutes } from "./servers-databases.js";
import { registerApplicationServerConnectRoutes } from "./servers-connect.js";

export { registerApplicationKeyAdminRoutes } from "./keys-admin.js";

/**
 * Machine Application API under `/api/application/*`.
 * One domain file per area for overview (users, servers-*, nodes, …).
 */
export function registerApplicationRoutes(app: FastifyInstance): void {
  registerApplicationUserRoutes(app);
  registerApplicationServerCoreRoutes(app);
  registerApplicationServerConnectRoutes(app);
  registerApplicationServerFilesRoutes(app);
  registerApplicationServerAddonsRoutes(app);
  registerApplicationServerBackupsRoutes(app);
  registerApplicationServerAllocationsRoutes(app);
  registerApplicationServerDatabasesRoutes(app);
  registerApplicationNodeRoutes(app);
  registerApplicationStorageRoutes(app);
  registerApplicationActivityRoutes(app);
  registerApplicationSettingsRoutes(app);
}
