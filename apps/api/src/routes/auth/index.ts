import type { FastifyInstance } from "fastify";
import { registerInviteRoutes } from "./invites.js";
import { registerAuthRoutes } from "./session.js";
import {
  registerTwoFactorGuard,
  registerTwoFactorRoutes,
} from "./two-factor.js";

export {
  registerAuthRoutes,
  registerInviteRoutes,
  registerTwoFactorGuard,
  registerTwoFactorRoutes,
};

/** Login/session, 2FA, invites. */
export function registerAuthHttpRoutes(app: FastifyInstance): void {
  registerAuthRoutes(app);
  registerTwoFactorRoutes(app);
  registerTwoFactorGuard(app);
  registerInviteRoutes(app);
}
