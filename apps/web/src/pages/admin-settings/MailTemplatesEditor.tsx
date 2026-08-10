import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Col, Form, Row, Spinner } from "react-bootstrap";
import {
  adminSettingsApi,
  type MailTemplateId,
  type MailTemplatesAdminView,
} from "../../api/admin-settings";
import { useI18n } from "../../i18n/react";

const TEMPLATE_LABELS: Record<MailTemplateId, string> = {
  "verify-email": "Verify email",
  "password-reset": "Password reset",
  "invite-set-password": "Invite — set password",
  "invite-server": "Invite — server",
  alert: "Activity alert",
  "test-mail": "Test mail",
};

type EditTarget = "layout" | MailTemplateId;

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
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<MailTemplatesAdminView | null>(null);
  const [target, setTarget] = useState<EditTarget>("test-mail");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const data = await adminSettingsApi.getMailTemplates();
      setView(data);
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
      setPreviewHtml(null);
      setPreviewSubject(null);
      return;
    }
    const row = view.templates[target];
    setSubject(row.subject);
    setHtml(row.html);
    setText(row.text);
    setPreviewHtml(null);
    setPreviewSubject(null);
  }, [view, target]);

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
      // Save current edits first so preview matches editor
      await adminSettingsApi.updateMailTemplates({
        templates: { [target]: { subject, html, text } },
      });
      const preview = await adminSettingsApi.previewMailTemplate(target);
      setPreviewSubject(preview.subject);
      setPreviewHtml(preview.html);
      const refreshed = await load();
      if (refreshed) setView(refreshed);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("adminSettings.mailTemplatesPreviewFailed"));
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

  return (
    <div className="mt-4 pt-3 border-top">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h3 className="h6 mb-0">{t("adminSettings.mailTemplatesHeading")}</h3>
        {customBadge ? <Badge bg="info">{t("adminSettings.mailTemplatesCustom")}</Badge> : null}
        {loading ? <Spinner size="sm" /> : null}
      </div>
      <p className="small text-secondary mb-3">{t("adminSettings.mailTemplatesHelp")}</p>

      <Row className="g-3">
        <Col md={4}>
          <Form.Group>
            <Form.Label>{t("adminSettings.mailTemplatesSelect")}</Form.Label>
            <Form.Select
              value={target}
              disabled={busy || loading || !view}
              onChange={(e) => setTarget(e.target.value as EditTarget)}
            >
              <option value="layout">{t("adminSettings.mailTemplatesLayout")}</option>
              {(view?.ids ?? Object.keys(TEMPLATE_LABELS)).map((id) => (
                <option key={id} value={id}>
                  {TEMPLATE_LABELS[id as MailTemplateId] ?? id}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={8} className="d-flex flex-wrap align-items-end gap-2">
          <Button type="button" variant="primary" disabled={busy || loading || !view} onClick={() => void onSave()}>
            {t("adminSettings.mailTemplatesSave")}
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            disabled={busy || loading || !view || target === "layout"}
            onClick={() => void onPreview()}
          >
            {t("adminSettings.mailTemplatesPreview")}
          </Button>
          <Button type="button" variant="outline-warning" disabled={busy || loading || !view} onClick={() => void onReset()}>
            {t("adminSettings.mailTemplatesResetOne")}
          </Button>
          <Button type="button" variant="outline-danger" disabled={busy || loading || !view} onClick={() => void onResetAll()}>
            {t("adminSettings.mailTemplatesResetAll")}
          </Button>
        </Col>

        {target !== "layout" && (
          <Col xs={12}>
            <Form.Group>
              <Form.Label>{t("adminSettings.mailTemplatesSubject")}</Form.Label>
              <Form.Control
                value={subject}
                disabled={busy || loading}
                onChange={(e) => setSubject(e.target.value)}
                spellCheck={false}
              />
            </Form.Group>
          </Col>
        )}

        <Col md={6}>
          <Form.Group>
            <Form.Label>
              {target === "layout"
                ? t("adminSettings.mailTemplatesLayoutHtml")
                : t("adminSettings.mailTemplatesHtml")}
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={14}
              className="font-monospace small"
              value={html}
              disabled={busy || loading}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>
              {target === "layout"
                ? t("adminSettings.mailTemplatesLayoutText")
                : t("adminSettings.mailTemplatesText")}
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={14}
              className="font-monospace small"
              value={text}
              disabled={busy || loading}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </Form.Group>
        </Col>

        {previewHtml && (
          <Col xs={12}>
            <div className="small text-secondary mb-1">
              {t("adminSettings.mailTemplatesPreviewLabel")}
              {previewSubject ? `: ${previewSubject}` : ""}
            </div>
            <div
              className="border rounded bg-white p-2"
              style={{ maxHeight: 420, overflow: "auto" }}
              // Preview of operator-owned HTML templates (admin-only).
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </Col>
        )}
      </Row>
    </div>
  );
}
