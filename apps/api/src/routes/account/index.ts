import type { FastifyInstance } from "fastify";
import { registerAccountApiRoutes } from "./api.js";
import { registerApiKeyRoutes } from "./api-keys.js";
import { registerAppPasswordRoutes } from "./app-passwords.js";
import { registerAccountGdprRoutes } from "./gdpr.js";
import { registerAccountProfileRoutes } from "./profile.js";
import { registerAccountPushRoutes } from "./push.js";

export {
  registerAccountApiRoutes,
  registerApiKeyRoutes,
  registerAppPasswordRoutes,
  registerAccountGdprRoutes,
  registerAccountProfileRoutes,
  registerAccountPushRoutes,
};

/** Account profile, GDPR, push, Client API keys, SFTP app passwords. */
export function registerAccountRoutes(app: FastifyInstance): void {
  registerAccountApiRoutes(app);
  registerAccountProfileRoutes(app);
  registerAccountGdprRoutes(app);
  registerAccountPushRoutes(app);
  registerApiKeyRoutes(app);
  registerAppPasswordRoutes(app);
}
