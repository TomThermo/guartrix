import type { FastifyInstance } from "fastify";
import { registerAdminStorageRoutes } from "../admin/storages.js";

/** @deprecated Node-scoped storage CRUD moved to /api/admin/storages — keeps list-for-node. */
export function registerNodeStorageRoutes(app: FastifyInstance): void {
  // List pools linked to a node is registered inside registerAdminStorageRoutes.
  void app;
}

export { registerAdminStorageRoutes };
