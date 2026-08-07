import type { FastifyInstance } from "fastify";
import { registerActivityRoutes } from "./activity.js";
import { registerLicenseRoutes } from "./license.js";
import { registerAdminSettingsRoutes } from "./settings.js";
import { registerStatusRoutes } from "./status.js";
import { registerAdminReadinessRoutes } from "./readiness.js";
import { registerAdminServerBackupRoutes } from "./server-backups.js";

export {
  registerActivityRoutes,
  registerLicenseRoutes,
  registerAdminSettingsRoutes,
  registerStatusRoutes,
  registerAdminReadinessRoutes,
  registerAdminServerBackupRoutes,
};

/** Admin panel: settings, license, status, global activity, readiness. */
export function registerAdminRoutes(app: FastifyInstance): void {
  registerLicenseRoutes(app);
  registerAdminSettingsRoutes(app);
  registerAdminServerBackupRoutes(app);
  registerActivityRoutes(app);
  registerStatusRoutes(app);
  registerAdminReadinessRoutes(app);
}
