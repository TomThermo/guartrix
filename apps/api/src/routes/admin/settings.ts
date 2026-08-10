import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { config } from "../../config.js";
import { sendMail, isSmtpConfigured, renderMail } from "../../mail.js";
import {
  applyMailTemplatesPatch,
  getMailTemplatesAdminView,
  previewVarsFor,
  MAIL_TEMPLATE_IDS,
  type MailTemplateId,
  type MailTemplatesPatch,
} from "../../mail.js";
import {
  deleteBrandingLogo,
  hasBrandingLogoFile,
  isManagedBrandingLogoUrl,
  readBrandingLogo,
  saveBrandingLogo,
} from "../../infra/branding-logo.js";
import { findUser } from "../../services/users.js";
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

  app.get("/api/public/branding/logo", async (_request, reply) => {
    const logo = await readBrandingLogo();
    if (!logo) {
      return reply.status(404).send({ error: "No branding logo uploaded" });
    }
    return reply
      .header("Content-Type", logo.mime)
      .header("Cache-Control", "public, max-age=86400")
      .header("ETag", `W/"branding-logo-${logo.mtimeMs}-${logo.buffer.length}"`)
      .send(logo.buffer);
  });

  app.get("/api/admin/settings", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;
    return {
      ...(await getPanelSettingsView()),
      brandingLogoUploaded: hasBrandingLogoFile(),
    };
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
      const restartRequired = restartRequiredForPatch(patch) || envChanged.length > 0;

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
        brandingLogoUploaded: hasBrandingLogoFile(),
        restartRequired,
        envChanged,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/api/admin/settings/branding/logo", async (request, reply) => {
    const user = await requireAdmin(request, reply, "settings.write");
    if (!user) return;
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "No image uploaded" });

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    try {
      const saved = await saveBrandingLogo({
        buffer,
        filename: file.filename || "logo.png",
        mimeType: file.mimetype || "",
      });
      const current = await readStoredSettings();
      const next = mergePanelSettingsPatch(current, { appLogo: saved.appLogo });
      await writeStoredSettings(next);
      applyPanelSettings(next);
      logActivity({
        action: "admin.settings.branding-logo",
        request,
        user,
        success: true,
        metadata: { action: "uploaded", ext: saved.ext, bytes: saved.bytes },
      });
      return {
        ok: true,
        appLogo: saved.appLogo,
        brandingLogoUploaded: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete("/api/admin/settings/branding/logo", async (request, reply) => {
    const user = await requireAdmin(request, reply, "settings.write");
    if (!user) return;
    try {
      const removed = await deleteBrandingLogo();
      const current = await readStoredSettings();
      let appLogo = config.appLogo;
      if (isManagedBrandingLogoUrl(appLogo) || isManagedBrandingLogoUrl(current.appLogo ?? "")) {
        const next = mergePanelSettingsPatch(current, { appLogo: "" });
        await writeStoredSettings(next);
        applyPanelSettings(next);
        appLogo = "";
      }
      logActivity({
        action: "admin.settings.branding-logo",
        request,
        user,
        success: true,
        metadata: { action: "deleted", removed },
      });
      return {
        ok: true,
        appLogo,
        brandingLogoUploaded: hasBrandingLogoFile(),
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
    const row = await findUser({
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
      const mail = renderMail("test-mail", {
        sentAt: new Date().toISOString(),
        smtpHost: config.mail.smtpHost,
        smtpPort: String(config.mail.smtpPort),
      });
      const result = await sendMail({
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      logActivity({
        action: "admin.settings.test-mail",
        request,
        user,
        success: result.delivered,
        metadata: { to, delivered: result.delivered, error: result.error ?? null },
      });
      if (!result.delivered) {
        return reply.status(502).send({
          ok: false,
          delivered: false,
          to,
          outboxPath: result.outboxPath,
          error: result.error ?? "SMTP delivery failed",
        });
      }
      return {
        ok: true,
        delivered: true,
        to,
        outboxPath: result.outboxPath,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });

  app.get("/api/admin/settings/mail-templates", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;
    return getMailTemplatesAdminView();
  });

  app.put<{ Body: MailTemplatesPatch }>("/api/admin/settings/mail-templates", async (request, reply) => {
    const user = await requireAdmin(request, reply, "settings.write");
    if (!user) return;
    try {
      const patch = (request.body ?? {}) as MailTemplatesPatch;
      await applyMailTemplatesPatch(patch);
      logActivity({
        action: "admin.settings.mail-templates",
        request,
        user,
        success: true,
        metadata: {
          resetAll: Boolean(patch.resetAll),
          resetId: patch.resetId ?? null,
          keys: Object.keys(patch),
        },
      });
      return getMailTemplatesAdminView();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Body: {
      id?: string;
      vars?: Record<string, string>;
      subject?: string;
      html?: string;
      text?: string;
      layoutHtml?: string;
      layoutTxt?: string;
    };
  }>("/api/admin/settings/mail-templates/preview", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;
    const id = String(request.body?.id ?? "test-mail") as MailTemplateId;
    if (!MAIL_TEMPLATE_IDS.includes(id)) {
      return reply.status(400).send({ error: `Unknown template id: ${id}` });
    }
    try {
      const vars = { ...previewVarsFor(id), ...(request.body?.vars ?? {}) };
      const draft = {
        subject: typeof request.body?.subject === "string" ? request.body.subject : undefined,
        html: typeof request.body?.html === "string" ? request.body.html : undefined,
        text: typeof request.body?.text === "string" ? request.body.text : undefined,
        layoutHtml:
          typeof request.body?.layoutHtml === "string" ? request.body.layoutHtml : undefined,
        layoutTxt: typeof request.body?.layoutTxt === "string" ? request.body.layoutTxt : undefined,
      };
      const mail = renderMail(id, vars, draft);
      return { ok: true, id, ...mail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
