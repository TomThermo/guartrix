import type { FastifyInstance } from "fastify";
import { registerAllocationListCreateRoutes } from "./allocations/list-create.js";
import { registerAllocationPatchDeleteRoutes } from "./allocations/patch-delete.js";
import { registerAllocationDatabaseRoutes } from "./allocations/database-allocs.js";

export function registerAllocationRoutes(app: FastifyInstance): void {
  registerAllocationListCreateRoutes(app);
  registerAllocationPatchDeleteRoutes(app);
  registerAllocationDatabaseRoutes(app);
}
