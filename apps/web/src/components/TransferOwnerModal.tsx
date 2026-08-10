import { useEffect, useState } from "react";
import type { AuthUser, McServer } from "@guartrix/shared";
import { roleLabel } from "@guartrix/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onTransferred: (server: McServer) => void;
}

export function TransferOwnerModal({ server, busy = false, onCancel, onTransferred }: Props) {
  const { t } = useI18n();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [ownerId, setOwnerId] = useState(server.ownerId ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOwnerId(server.ownerId ?? "");
    setLoading(true);
    void api
      .listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : t("users.loadFailed")))
      .finally(() => setLoading(false));
  }, [server.ownerId, t]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateServer(server.id, {
        ownerId: ownerId || null,
      });
      onTransferred({
        ...server,
        ...updated,
        ownerId: updated.ownerId,
        ownerUsername: updated.ownerUsername,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modals.transferOwnerFailed"));
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving || loading;

  return (
    <Modal show onHide={disabled ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!disabled}>
        <Modal.Title>
          <i className="fa-solid fa-user-tag me-2" />
          {t("modals.transferOwnerTitle")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">{t("modals.transferOwnerHelp", { name: server.name })}</p>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}
        {loading ? (
          <div className="text-center py-3 text-secondary">
            <Spinner size="sm" className="me-2" />
            {t("modals.transferOwnerLoading")}
          </div>
        ) : (
          <Form.Group>
            <Form.Label>{t("common.owner")}</Form.Label>
            <Form.Select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              disabled={disabled}
            >
              <option value="">— {t("common.unassigned")} —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({roleLabel(u.role)})
                  {u.id === server.ownerId ? t("modals.transferOwnerCurrent") : ""}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={disabled} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={disabled || ownerId === (server.ownerId ?? "")}
          onClick={() => void onSave()}
        >
          {saving ? <Spinner size="sm" /> : t("modals.transferOwnerSave")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
