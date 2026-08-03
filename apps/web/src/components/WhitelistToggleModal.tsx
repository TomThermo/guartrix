import { useEffect, useState } from "react";
import type { ServerDetail } from "@msm/shared";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  server: ServerDetail;
  busy?: boolean;
  onCancel: () => void;
  onSaved: (server: ServerDetail) => void;
  onError: (message: string | null) => void;
}

function bool(v: string | undefined, fallback = false): string {
  if (v === "true" || v === "false") return v;
  return fallback ? "true" : "false";
}

export function WhitelistToggleModal({
  server,
  busy = false,
  onCancel,
  onSaved,
  onError,
}: Props) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(bool(server.properties["white-list"]));
  const [enforce, setEnforce] = useState(bool(server.properties["enforce-whitelist"]));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(bool(server.properties["white-list"]));
    setEnforce(bool(server.properties["enforce-whitelist"]));
  }, [server]);

  async function save() {
    setSaving(true);
    onError(null);
    try {
      const updated = await api.updateServer(server.id, {
        properties: {
          "white-list": enabled,
          "enforce-whitelist": enforce,
        },
      });
      onSaved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("modals.whitelistUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  const locked = busy || saving;

  return (
    <Modal show onHide={locked ? undefined : onCancel} centered>
      <Modal.Header closeButton={!locked}>
        <Modal.Title>
          <i className="fa-solid fa-user-check me-2" />
          {t("modals.whitelistToggleTitle")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-secondary small mb-3">
          {t("modals.whitelistToggleHelp", { name: server.name })}
          {server.status === "RUNNING"
            ? t("modals.whitelistToggleRunning")
            : t("modals.whitelistToggleStopped")}
        </p>
        <Form className="d-grid gap-3">
          <Form.Group>
            <Form.Label className="small mb-1">{t("whitelist.title")}</Form.Label>
            <Form.Select
              value={enabled}
              disabled={locked}
              onChange={(e) => setEnabled(e.target.value)}
            >
              <option value="true">{t("common.enabled")}</option>
              <option value="false">{t("common.disabled")}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="small mb-1">{t("modals.whitelistToggleEnforce")}</Form.Label>
            <Form.Select
              value={enforce}
              disabled={locked}
              onChange={(e) => setEnforce(e.target.value)}
            >
              <option value="true">{t("common.enabled")}</option>
              <option value="false">{t("common.disabled")}</option>
            </Form.Select>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={locked} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={locked} onClick={() => void save()}>
          {saving ? <Spinner size="sm" /> : t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
