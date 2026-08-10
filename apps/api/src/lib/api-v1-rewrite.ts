/**
 * Stable public API alias: /api/v1/* → /api/*
 * Must be applied via Fastify `rewriteUrl` (before routing).
 */
export function rewriteApiV1Url(url: string): string {
  if (url === "/api/v1" || url.startsWith("/api/v1/") || url.startsWith("/api/v1?")) {
    return url.replace(/^\/api\/v1/, "/api");
  }
  return url;
}
