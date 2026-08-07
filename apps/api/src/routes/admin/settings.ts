import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { prisma } from "../../db.js";
import { sendMail, isSmtpConfigured } from "../../mail.js";
import {
  applyPanelSettings,
  getPanelSettingsView,
  getPublicBranding,
  mergePanelSettingsPatch,
  readStoredSettings,
  restartRequiredForPatch,
  syncEnvFromSettings,
  writeStoredSettings,
  type PanelSettingsPatch,
} from "../../panel-settings.js";

export function registerAdminSettingsRoutes(app: FastifyInstance): void {
  app.get("/api/public/branding", async () => getPublicBranding());

  app.get("/api/admin/settings", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;
    return getPanelSettingsView();
  });

  app.put<{ Body: PanelSettingsPatch }>("/api/admin/settings", async (request, reply) => {
    const user = await requireAdmin(request, reply, "settings.write");
    if (!user) return;
    const patch = (request.body ?? {}) as PanelSettingsPatch;
    try {
      const current = await readStoredSettings();
      const next = mergePanelSettingsPatch(current, patch);
      await writeStoredSettings(next);
      applyPanelSettings(next);
      const envChanged = await syncEnvFromSettings(next);
      const restartRequired =
        restartRequiredForPatch(patch) || envChanged.length > 0;

      logActivity({
        action: "admin.settings.update",
        request,
        user,
        success: true,
        metadata: {
          keys: Object.keys(patch),
          envChanged,
          restartRequired,
        },
      });

      return {
        ...(await getPanelSettingsView()),
        restartRequired,
        envChanged,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/api/admin/settings/test-redis", async (request, reply) => {
    const user = await requireAdmin(request, reply, "settings.write");
    if (!user) return;
    const { pingRedis, getRedisStatus } = await import("../../redis.js");
    const ping = await pingRedis();
    const status = await getRedisStatus();
    logActivity({
      action: "admin.settings.test-redis",
      request,
      user,
      success: ping.ok,
      metadata: {
        connected: ping.ok,
        latencyMs: ping.latencyMs,
        error: ping.error,
      },
    });
    if (!status.configured) {
      return reply.status(400).send({
        ...status,
        error:
          "Redis is not configured — set REDIS_URL in .env (or re-run the installer with Docker/external Redis)",
      });
    }
    if (!ping.ok) {
      return reply.status(502).send({
        ...status,
        error: ping.error ?? "Redis ping failed",
      });
    }
    return { ok: true, ...status };
  });

  app.post("/api/admin/settings/test-mail", async (request, reply) => {
    const user = await requireAdmin(request, reply, "settings.write");
    if (!user) return;
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    const to = row?.email?.trim() || "";
    if (!to) {
      return reply.status(400).send({ error: "Admin account has no email" });
    }
    if (!isSmtpConfigured()) {
      return reply.status(400).send({
        error: "SMTP is not configured — set host under Mail settings first",
      });
    }
    try {
      const result = await sendMail({
        to,
        subject: "Guartrix test mail",
        text: `This is a test message from your Guartrix panel.\n\nSent at ${new Date().toISOString()}\n`,
      });
      logActivity({
        action: "admin.settings.test-mail",
        request,
        user,
        success: result.delivered,
        metadata: { to, delivered: result.delivered },
      });
      return {
        ok: true,
        delivered: result.delivered,
        to,
        outboxPath: result.outboxPath,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });
}
