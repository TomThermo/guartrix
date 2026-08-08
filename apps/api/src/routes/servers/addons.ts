import type { FastifyInstance } from "fastify";
import { registerAddonInstalledRoutes } from "./addons/installed-routes.js";
import { registerAddonModpackRoutes } from "./addons/modpack-routes.js";
import { registerAddonSearchRoutes } from "./addons/search-routes.js";
import { registerAddonStacksRoutes } from "./addons/stacks-routes.js";

/** Addon / modpack / geyser routes (split from servers.ts). */
export function registerServerAddonRoutes(app: FastifyInstance): void {
  registerAddonSearchRoutes(app);
  registerAddonInstalledRoutes(app);
  registerAddonStacksRoutes(app);
  registerAddonModpackRoutes(app);
}
