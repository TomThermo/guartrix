import type { FastifyInstance } from "fastify";
import { requireAdmin, requireAuth } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import {
  getLicenseKey,
  setLicenseKey,
  clearLicenseKey,
  validateLicense,
  userFacingLicenseMessage,
  LICENSE_POWER_BLOCKED_CODE,
  getLicenseServerUrlInfo,
  setLicenseServerUrl,
  getCachedLicenseState,
  getPanelServerUsage,
  getUnlicensedFreeTier,
} from "../../license/license.js";

async function adminLicensePayload() {
  const [state, server, usage] = await Promise.all([
    validateLicense(true),
    getLicenseServerUrlInfo(),
    getPanelServerUsage(),
  ]);
  const freeTier = getUnlicensedFreeTier();
  return {
    ...state,
    // When unlicensed, surface free-tier caps so Admin → License shows allowance.
    ...(state.valid
      ? {}
      : {
          maxServers: freeTier.maxServers,
          maxNodes: freeTier.maxNodes,
          maxDiskMb: freeTier.maxDiskMb,
          freeTier: true,
        }),
    hasKey: Boolean(await getLicenseKey()),
    serverUrl: server.url,
    serverUrlSource: server.source,
    serverUrlEnvDefault: server.envDefault,
    usage,
  };
}

export function registerLicenseRoutes(app: FastifyInstance): void {
  /** Any logged-in user — sanitized status (no secrets / console URL). */
  app.get("/api/license/status", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const state = getCachedLicenseState() ?? (await validateLicense(false));
    return {
      valid: state.valid,
      status: state.status,
      message: userFacingLicenseMessage(state),
      expiresAt: state.expiresAt,
    };
  });

  app.get("/api/admin/license", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "license.read"))) return;
    return adminLicensePayload();
  });

  app.put<{ Body: { key?: string } }>("/api/admin/license", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "license.write"))) return;
    const key = request.body?.key?.trim();
    if (!key) return reply.status(400).send({ error: "key is required" });
    await setLicenseKey(key);
    return adminLicensePayload();
  });

  app.put<{ Body: { url?: string | null } }>(
    "/api/admin/license/server",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, "license.write"))) return;
      try {
        const raw = request.body?.url;
        await setLicenseServerUrl(
          raw === null || raw === undefined ? null : String(raw),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
      return adminLicensePayload();
    },
  );

  app.post("/api/admin/license/revalidate", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "license.write"))) return;
    return adminLicensePayload();
  });

  /** Remove the license key — the panel drops to the unlicensed free tier. */
  app.delete("/api/admin/license", async (request, reply) => {
    const user = await requireAdmin(request, reply, "license.write");
    if (!user) return;
    const hadKey = Boolean(await getLicenseKey());
    await clearLicenseKey();
    logActivity({
      action: "license.removed",
      request,
      user,
      serverId: null,
      success: true,
      metadata: { hadKey },
    });
    // Revalidate now so free-tier enforcement (stop over-cap servers) applies
    // immediately instead of on the next background check.
    return adminLicensePayload();
  });

  app.get("/api/admin/license/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "license.read"))) return;
    // Use cache for the nav banner (anti-DoS). Admin → License page forces via
    // GET /api/admin/license and POST …/revalidate.
    const state = getCachedLicenseState() ?? (await validateLicense(false));
    return {
      valid: state.valid,
      status: state.status,
      message: state.message,
      expiresAt: state.expiresAt,
      code: state.valid ? undefined : LICENSE_POWER_BLOCKED_CODE,
    };
  });
}
