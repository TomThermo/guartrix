import type { FastifyInstance } from "fastify";
import {
  ADMIN_PANEL_PRESETS,
  ADMIN_PANEL_SCOPES,
  API_KEY_PRESETS,
  APPLICATION_API_PRESETS,
  APPLICATION_SCOPES,
  PERMISSION_GROUPS,
  SERVER_PERMISSIONS,
} from "@msm/shared";
import { getSessionUser, requireAuth } from "../auth/auth.js";

export function registerAccountApiRoutes(app: FastifyInstance): void {
  /** Account profile and quotas (session or Client API key). */
  app.get("/api/account", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return {
      user,
      apiKey: request.apiKeyAuth
        ? {
            prefix: request.apiKeyAuth.prefix,
            permissions: request.apiKeyAuth.permissions,
            serverIds: request.apiKeyAuth.serverIds,
            adminScopes: request.apiKeyAuth.adminScopes,
          }
        : null,
    };
  });

  /** Permission catalog for building Client / Application keys (no auth). */
  app.get("/api/account/api-reference", async () => ({
    clientApi: {
      tokenPrefix: "gt_",
      rateLimitPerMinute: Number(process.env.API_KEY_RATE_LIMIT ?? 120),
      maxKeysPerUser: 10,
      serverPermissions: SERVER_PERMISSIONS,
      permissionGroups: PERMISSION_GROUPS,
      presets: API_KEY_PRESETS,
      adminPanelScopes: ADMIN_PANEL_SCOPES,
      adminPanelPresets: ADMIN_PANEL_PRESETS,
    },
    applicationApi: {
      tokenPrefix: "gta_",
      scopes: APPLICATION_SCOPES,
      presets: APPLICATION_API_PRESETS,
    },
    docs: {
      client: "/wiki/client-api",
      application: "/wiki/application-api",
      openapi: "/docs/openapi.yaml",
    },
  }));

  /** Same as GET /api/auth/me but documented under /api/account for API clients. */
  app.get("/api/account/session", async (request) => {
    const user = await getSessionUser(request);
    return { authenticated: Boolean(user), user };
  });
}
