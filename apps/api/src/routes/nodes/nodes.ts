import type { FastifyInstance } from "fastify";
import { registerNodeAdminCrudRoutes } from "./admin-crud.js";
import { registerNodeAdminInstallRoutes } from "./admin-install.js";
import { registerNodeAdminStatusRoutes } from "./admin-status.js";
import { registerNodeListRoutes } from "./list-routes.js";

export function registerNodeRoutes(app: FastifyInstance): void {
  registerNodeListRoutes(app);
  registerNodeAdminCrudRoutes(app);
  registerNodeAdminStatusRoutes(app);
  registerNodeAdminInstallRoutes(app);
}
