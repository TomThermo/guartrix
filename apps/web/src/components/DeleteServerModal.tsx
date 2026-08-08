import { useState, type FormEvent } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  serverId: string;
  serverName: string;
  onCancel: () => void;
  onDeleted: () => void;
}

export function DeleteServerModal({ serverId, serverName, onCancel, onDeleted }: Props) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError(t("modals.deleteServerPasswordRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteServer(serverId, password);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modals.deleteServerFailed"));
      setBusy(false);
    }
  }

  return (
    <Modal show onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Form onSubmit={(e) => void onSubmit(e)}>
        <Modal.Header closeButton={!busy}>
          <Modal.Title className="text-danger">
            <i className="fa-solid fa-triangle-exclamation me-2" />
            {t("modals.deleteServerTitle")}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger" className="mb-3">
            <strong>{t("modals.deleteServerIrreversible")}</strong>
            <div className="mt-2 small mb-0">
              {t("modals.deleteServerBody", { name: serverName })}
            </div>
          </Alert>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Group controlId="delete-server-password">
            <Form.Label>{t("modals.deleteServerPasswordLabel")}</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              autoFocus
              placeholder={t("modals.deleteServerPasswordPlaceholder")}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Form.Text muted>{t("modals.deleteServerPasswordHelp")}</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !password.trim()}>
            {busy ? (
              <>
                <Spinner size="sm" className="me-2" />
                {t("common.deleting")}
              </>
            ) : (
              <>
                <i className="fa-solid fa-trash me-1" />
                {t("modals.deleteServerConfirm")}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
