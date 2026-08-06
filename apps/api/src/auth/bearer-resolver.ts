import type { FastifyInstance } from "fastify";
import { resolveApiKeyAuth } from "./api-keys.js";
import { resolveApplicationAuth } from "./application-keys.js";

function extractBearer(request: { headers: { authorization?: string } }): string | null {
  const auth = request.headers.authorization;
  if (typeof auth !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return match?.[1] ?? null;
}

/**
 * Resolve `gt_` / `gta_` Bearer tokens before route preHandlers that call
 * synchronous `isAuthenticated()`.
 */
export function registerBearerAuthResolver(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    if (request.apiKeyAuth) return;
    const token = extractBearer(request);
    if (!token) return;
    if (token.startsWith("gt_")) {
      await resolveApiKeyAuth(request);
      return;
    }
    if (token.startsWith("gta_")) {
      await resolveApplicationAuth(request);
    }
  });
}
