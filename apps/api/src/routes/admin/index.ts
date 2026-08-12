import type { FastifyInstance } from "fastify";
import { registerActivityRoutes } from "./activity.js";
import { registerLicenseRoutes } from "./license.js";
import { registerAdminSettingsRoutes } from "./settings.js";
import { registerStatusRoutes } from "./status.js";
import { registerAdminReadinessRoutes } from "./readiness.js";
import { registerAdminServerRoutes } from "./servers.js";
import { registerAdminNavCountsRoutes } from "./nav-counts.js";
import { registerAdminStorageRoutes } from "./storages.js";

export {
  registerActivityRoutes,
  registerLicenseRoutes,
  registerAdminSettingsRoutes,
  registerStatusRoutes,
  registerAdminReadinessRoutes,
  registerAdminServerRoutes,
  registerAdminServerRoutes as registerAdminServerBackupRoutes,
  registerAdminNavCountsRoutes,
  registerAdminStorageRoutes,
};

/** Admin panel: settings, license, status, global activity, readiness. */
export function registerAdminRoutes(app: FastifyInstance): void {
  registerLicenseRoutes(app);
  registerAdminSettingsRoutes(app);
  registerAdminServerRoutes(app);
  registerAdminNavCountsRoutes(app);
  registerAdminStorageRoutes(app);
  registerActivityRoutes(app);
  registerStatusRoutes(app);
  registerAdminReadinessRoutes(app);
}
