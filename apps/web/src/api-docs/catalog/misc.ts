import type { ApiEndpointDemo } from "./types";

/** Public / unauthenticated demos. */
export const MISC_DEMOS: ApiEndpointDemo[] = [
  {
    id: "health",
    group: "Public",
    title: "Health check",
    description: "Liveness probe — no authentication required.",
    method: "GET",
    path: "/api/health",
    auth: "none",
    safe: true,
    sampleResponse: { ok: true },
  },
  {
    id: "api-reference",
    group: "Public",
    title: "Permission catalog",
    description: "Machine-readable Client + Application permission presets.",
    method: "GET",
    path: "/api/account/api-reference",
    auth: "none",
    safe: true,
  },
];
