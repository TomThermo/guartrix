import type { FastifyInstance } from "fastify";
import { registerActivityRoutes } from "./activity.js";
import { registerLicenseRoutes } from "./license.js";
import { registerAdminSettingsRoutes } from "./settings.js";
import { registerStatusRoutes } from "./status.js";

export {
  registerActivityRoutes,
  registerLicenseRoutes,
  registerAdminSettingsRoutes,
  registerStatusRoutes,
};

/** Admin panel: settings, license, status, global activity. */
export function registerAdminRoutes(app: FastifyInstance): void {
  registerLicenseRoutes(app);
  registerAdminSettingsRoutes(app);
  registerActivityRoutes(app);
  registerStatusRoutes(app);
}
