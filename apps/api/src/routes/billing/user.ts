import type { FastifyInstance } from "fastify";
import { registerBillingMollieWebhookRoutes } from "./user-mollie.js";
import { registerBillingUserReadRoutes } from "./user-read.js";

export function registerBillingUserRoutes(app: FastifyInstance): void {
  registerBillingUserReadRoutes(app);
  registerBillingMollieWebhookRoutes(app);
}
