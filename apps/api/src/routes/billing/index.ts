import type { FastifyInstance } from "fastify";
import { registerBillingAdminRoutes } from "./admin.js";
import { registerBillingApplicationRoutes } from "./application.js";
import { registerBillingUserRoutes } from "./user.js";

export {
  registerBillingAdminRoutes,
  registerBillingApplicationRoutes,
  registerBillingUserRoutes,
};

/** Billing: user checkout, admin plans, Application API plans. */
export function registerBillingRoutes(app: FastifyInstance): void {
  registerBillingUserRoutes(app);
  registerBillingAdminRoutes(app);
  registerBillingApplicationRoutes(app);
}
