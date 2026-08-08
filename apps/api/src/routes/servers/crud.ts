import type { FastifyInstance } from "fastify";
import { registerServerCreateRoutes } from "./crud/create-routes.js";
import { registerServerDeleteCloneRoutes } from "./crud/delete-clone-routes.js";
import { registerServerReadRoutes } from "./crud/read-routes.js";

/** CRUD + stats/connect/disk/clone routes (split from servers.ts). */
export function registerServerCrudRoutes(app: FastifyInstance): void {
  registerServerCreateRoutes(app);
  registerServerReadRoutes(app);
  registerServerDeleteCloneRoutes(app);
}
