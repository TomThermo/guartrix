import type { FastifyInstance } from "fastify";
import { registerInviteRoutes } from "./invites.js";
import { registerAuthRoutes } from "./session.js";
import {
  registerTwoFactorGuard,
  registerTwoFactorRoutes,
} from "./two-factor.js";
import { registerPanelUserRoutes } from "./users.js";

export {
  registerAuthRoutes,
  registerInviteRoutes,
  registerPanelUserRoutes,
  registerTwoFactorGuard,
  registerTwoFactorRoutes,
};

/** Login/session, 2FA, invites, panel user admin. */
export function registerAuthHttpRoutes(app: FastifyInstance): void {
  registerAuthRoutes(app);
  registerTwoFactorRoutes(app);
  registerTwoFactorGuard(app);
  registerInviteRoutes(app);
  registerPanelUserRoutes(app);
}
