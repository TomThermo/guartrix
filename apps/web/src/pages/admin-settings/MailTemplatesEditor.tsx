import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Form, Nav, Spinner } from "react-bootstrap";
import {
  adminSettingsApi,
  type MailTemplateId,
  type MailTemplatesAdminView,
} from "../../api/admin-settings";
import { useI18n } from "../../i18n/react";
import { MailCodeEditor } from "./MailCodeEditor";

const TEMPLATE_LABELS: Record<MailTemplateId, string> = {
  "verify-email": "Verify email",
  "password-reset": "Password reset",
  "invite-set-password": "Invite — set password",
  "invite-server": "Invite — server",
  alert: "Activity alert",
  "test-mail": "Test mail",
};

type EditTarget = "layout" | MailTemplateId;
type EditorPane = "html" | "text" | "preview";
type PreviewTheme = "light" | "dark";

const PREVIEW_THEME_KEY = "guartrix.mailTemplatePreviewTheme";

function readStoredPreviewTheme(): PreviewTheme {
  try {
    const raw = localStorage.getItem(PREVIEW_THEME_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function notifyBrandingChanged(): void {
  window.dispatchEvent(new Event("guartrix:branding-changed"));
}

export function MailTemplatesEditor({
  busy,
  onBusy,
  onNotice,
  onError,
}: {
  busy: boolean;
  onBusy: (v: boolean) => void;
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<MailTemplatesAdminView | null>(null);
  const [target, setTarget] = useState<EditTarget>("test-mail");
  const [pane, setPane] = useState<EditorPane>("html");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>(() => readStoredPreviewTheme());
  const [appLogo, setAppLogo] = useState("");
  const [logoUrlDraft, setLogoUrlDraft] = useState("");
  const [brandingLogoUploaded, setBrandingLogoUploaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const [data, settings] = await Promise.all([
        adminSettingsApi.getMailTemplates(),
        adminSettingsApi.getPanelSettings(),
      ]);
      setView(data);
      setAppLogo(settings.appLogo || "");
      setLogoUrlDraft(settings.appLogo || "");
      setBrandingLogoUploaded(Boolean(settings.brandingLogoUploaded));
      return data;
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailTemplatesLoadFailed"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!view) return;
    if (target === "layout") {
      setSubject("");
      setHtml(view.layoutHtml);
      setText(view.layoutTxt);
      return;
    }
    const row = view.templates[target];
    setSubject(row.subject);
    setHtml(row.html);
    setText(row.text);
  }, [view, target]);

  useEffect(() => {
    setPreviewHtml(null);
    setPreviewSubject(null);
    setPane("html");
  }, [target]);

  async function onSave() {
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next =
        target === "layout"
          ? await adminSettingsApi.updateMailTemplates({
              layoutHtml: html,
              layoutTxt: text,
            })
          : await adminSettingsApi.updateMailTemplates({
              templates: {
                [target]: { subject, html, text },
              },
            });
      setView(next);
      onNotice(t("adminSettings.mailTemplatesSaved"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailTemplatesSaveFailed"));
    } finally {
      onBusy(false);
    }
  }

  async function onReset() {
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next =
        target === "layout"
          ? await adminSettingsApi.updateMailTemplates({
              layoutHtml: null,
              layoutTxt: null,
            })
          : await adminSettingsApi.updateMailTemplates({ resetId: target });
      setView(next);
      onNotice(t("adminSettings.mailTemplatesReset"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailTemplatesSaveFailed"));
    } finally {
      onBusy(false);
    }
  }

  async function onResetAll() {
    if (!window.confirm(t("adminSettings.mailTemplatesResetAllConfirm"))) return;
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next = await adminSettingsApi.updateMailTemplates({ resetAll: true });
      setView(next);
      onNotice(t("adminSettings.mailTemplatesReset"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailTemplatesSaveFailed"));
    } finally {
      onBusy(false);
    }
  }

  async function onPreview() {
    if (target === "layout") return;
    onBusy(true);
    onError(null);
    try {
      const preview = await adminSettingsApi.previewMailTemplate(target, {
        subject,
        html,
        text,
      });
      setPreviewSubject(preview.subject);
      setPreviewHtml(preview.html);
      setPane("preview");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailTemplatesPreviewFailed"));
    } finally {
      onBusy(false);
    }
  }

  async function onSelectPane(next: EditorPane) {
    if (next === "preview") {
      if (target === "layout") return;
      await onPreview();
      return;
    }
    setPane(next);
  }

  function onPreviewThemeChange(next: PreviewTheme) {
    setPreviewTheme(next);
    try {
      localStorage.setItem(PREVIEW_THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }

  async function onUploadLogo(file: File | null) {
    if (!file) return;
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await adminSettingsApi.uploadBrandingLogo(file);
      setAppLogo(result.appLogo);
      setLogoUrlDraft(result.appLogo);
      setBrandingLogoUploaded(result.brandingLogoUploaded);
      notifyBrandingChanged();
      onNotice(t("adminSettings.mailLogoUploaded"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailLogoUploadFailed"));
    } finally {
      onBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSaveLogoUrl() {
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const settings = await adminSettingsApi.updatePanelSettings({
        appLogo: logoUrlDraft.trim(),
      });
      setAppLogo(settings.appLogo || "");
      setLogoUrlDraft(settings.appLogo || "");
      setBrandingLogoUploaded(Boolean(settings.brandingLogoUploaded));
      notifyBrandingChanged();
      onNotice(t("adminSettings.mailLogoSaved"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailLogoSaveFailed"));
    } finally {
      onBusy(false);
    }
  }

  async function onDeleteLogo() {
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await adminSettingsApi.deleteBrandingLogo();
      setAppLogo(result.appLogo || "");
      setLogoUrlDraft(result.appLogo || "");
      setBrandingLogoUploaded(result.brandingLogoUploaded);
      notifyBrandingChanged();
      onNotice(t("adminSettings.mailLogoDeleted"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailLogoDeleteFailed"));
    } finally {
      onBusy(false);
    }
  }

  const customBadge =
    target === "layout"
      ? view?.layoutHtmlCustom || view?.layoutTxtCustom
      : view?.templates[target]?.custom.subject ||
        view?.templates[target]?.custom.html ||
        view?.templates[target]?.custom.text;

  const disabled = busy || loading || !view;
  const editorPath = `mail-template/${target}.${pane === "text" ? "txt" : "html"}`;

  return (
    <div className="mail-template-editor">
      <div className="mail-template-editor__head">
        <div className="mail-template-editor__title">
          <h3 className="h6 mb-0">{t("adminSettings.mailTemplatesHeading")}</h3>
          {customBadge ? <Badge bg="secondary">{t("adminSettings.mailTemplatesCustom")}</Badge> : null}
          {loading ? <Spinner size="sm" /> : null}
        </div>
        <p className="mail-template-editor__help mb-0">{t("adminSettings.mailTemplatesHelp")}</p>
      </div>

      <div className="mail-template-editor__logo">
        <div className="mail-template-editor__logo-preview">
          {appLogo ? (
            <img src={appLogo} alt="" className="mail-template-editor__logo-img" />
          ) : (
            <span className="mail-template-editor__logo-empty">{t("adminSettings.mailLogoEmpty")}</span>
          )}
        </div>
        <div className="mail-template-editor__logo-controls">
          <div className="mail-template-editor__label">{t("adminSettings.mailLogoHeading")}</div>
          <p className="mail-template-editor__help mb-2">{t("adminSettings.mailLogoHelp")}</p>
          <div className="mail-template-editor__logo-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
              className="d-none"
              onChange={(e) => void onUploadLogo(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              disabled={busy || loading}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("adminSettings.mailLogoUpload")}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              disabled={busy || loading || (!brandingLogoUploaded && !appLogo)}
              onClick={() => void onDeleteLogo()}
            >
              {t("adminSettings.mailLogoRemove")}
            </Button>
          </div>
          <label className="mail-template-editor__field mb-0 mt-2">
            <span className="mail-template-editor__label">{t("adminSettings.mailLogoUrl")}</span>
            <div className="mail-template-editor__logo-url-row">
              <input
                className="mail-template-editor__input"
                value={logoUrlDraft}
                disabled={busy || loading}
                onChange={(e) => setLogoUrlDraft(e.target.value)}
                placeholder="https://… or /logo.png"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy || loading || logoUrlDraft.trim() === appLogo.trim()}
                onClick={() => void onSaveLogoUrl()}
              >
                {t("adminSettings.mailLogoSaveUrl")}
              </Button>
            </div>
          </label>
        </div>
      </div>

      <div className="mail-template-editor__toolbar">
        <Form.Select
          className="mail-template-editor__select"
          value={target}
          disabled={disabled}
          onChange={(e) => setTarget(e.target.value as EditTarget)}
          aria-label={t("adminSettings.mailTemplatesSelect")}
        >
          <option value="layout">{t("adminSettings.mailTemplatesLayout")}</option>
          {(view?.ids ?? Object.keys(TEMPLATE_LABELS)).map((id) => (
            <option key={id} value={id}>
              {TEMPLATE_LABELS[id as MailTemplateId] ?? id}
            </option>
          ))}
        </Form.Select>
        <div className="mail-template-editor__actions">
          <Button type="button" variant="primary" size="sm" disabled={disabled} onClick={() => void onSave()}>
            {t("adminSettings.mailTemplatesSave")}
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            disabled={disabled || target === "layout"}
            onClick={() => void onPreview()}
          >
            {t("adminSettings.mailTemplatesPreview")}
          </Button>
          <Button type="button" variant="outline-secondary" size="sm" disabled={disabled} onClick={() => void onReset()}>
            {t("adminSettings.mailTemplatesResetOne")}
          </Button>
          <Button type="button" variant="outline-secondary" size="sm" disabled={disabled} onClick={() => void onResetAll()}>
            {t("adminSettings.mailTemplatesResetAll")}
          </Button>
        </div>
      </div>

      {target !== "layout" ? (
        <label className="mail-template-editor__field">
          <span className="mail-template-editor__label">{t("adminSettings.mailTemplatesSubject")}</span>
          <input
            className="mail-template-editor__input"
            value={subject}
            disabled={busy || loading}
            onChange={(e) => setSubject(e.target.value)}
            spellCheck={false}
          />
        </label>
      ) : null}

      <Nav variant="tabs" className="mail-template-editor__tabs">
        <Nav.Item>
          <Nav.Link active={pane === "html"} disabled={busy || loading} onClick={() => void onSelectPane("html")}>
            {target === "layout"
              ? t("adminSettings.mailTemplatesLayoutHtml")
              : t("adminSettings.mailTemplatesHtml")}
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link active={pane === "text"} disabled={busy || loading} onClick={() => void onSelectPane("text")}>
            {target === "layout"
              ? t("adminSettings.mailTemplatesLayoutText")
              : t("adminSettings.mailTemplatesText")}
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link
            active={pane === "preview"}
            disabled={busy || loading || target === "layout"}
            onClick={() => void onSelectPane("preview")}
          >
            {t("adminSettings.mailTemplatesPreview")}
          </Nav.Link>
        </Nav.Item>
      </Nav>

      <div className="mail-template-editor__pane">
        {pane === "html" ? (
          <MailCodeEditor
            path={editorPath}
            language="html"
            value={html}
            disabled={busy || loading}
            onChange={setHtml}
            onSave={() => void onSave()}
          />
        ) : null}
        {pane === "text" ? (
          <MailCodeEditor
            path={editorPath}
            language="plaintext"
            value={text}
            disabled={busy || loading}
            onChange={setText}
            onSave={() => void onSave()}
          />
        ) : null}
        {pane === "preview" ? (
          <div
            className={`mail-template-editor__preview mail-template-editor__preview--${previewTheme}`}
          >
            <div className="mail-template-editor__preview-bar">
              <div className="mail-template-editor__preview-subject">
                {previewSubject ?? t("adminSettings.mailTemplatesPreview")}
              </div>
              <div
                className="mail-template-editor__theme-toggle"
                role="group"
                aria-label={t("adminSettings.mailTemplatesPreviewTheme")}
              >
                <button
                  type="button"
                  className={
                    previewTheme === "light"
                      ? "mail-template-editor__theme-btn is-active"
                      : "mail-template-editor__theme-btn"
                  }
                  disabled={busy || loading}
                  onClick={() => onPreviewThemeChange("light")}
                >
                  {t("adminSettings.mailTemplatesPreviewLight")}
                </button>
                <button
                  type="button"
                  className={
                    previewTheme === "dark"
                      ? "mail-template-editor__theme-btn is-active"
                      : "mail-template-editor__theme-btn"
                  }
                  disabled={busy || loading}
                  onClick={() => onPreviewThemeChange("dark")}
                >
                  {t("adminSettings.mailTemplatesPreviewDark")}
                </button>
              </div>
            </div>
            <p className="mail-template-editor__preview-hint mb-0">
              {t("adminSettings.mailTemplatesPreviewThemeHelp")}
            </p>
            {previewHtml ? (
              <div className="mail-template-editor__preview-body">
                <div
                  className="mail-template-editor__preview-mail"
                  // Preview of operator-owned HTML templates (admin-only).
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            ) : (
              <div className="mail-template-editor__preview-empty">{t("adminSettings.mailTemplatesPreviewEmpty")}</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
