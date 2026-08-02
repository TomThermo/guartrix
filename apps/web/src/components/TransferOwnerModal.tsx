import { useEffect, useState } from "react";
import type { AuthUser, McServer } from "@msm/shared";
import { roleLabel } from "@msm/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onTransferred: (server: McServer) => void;
}

export function TransferOwnerModal({ server, busy = false, onCancel, onTransferred }: Props) {
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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, [server.id, server.ownerId]);

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
      setError(err instanceof Error ? err.message : "Transfer failed");
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
          Transfer owner
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">
          Choose who owns <strong>{server.name}</strong>. That user (and admins) can manage it;
          other users will no longer see it.
        </p>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}
        {loading ? (
          <div className="text-center py-3 text-secondary">
            <Spinner size="sm" className="me-2" />
            Loading users…
          </div>
        ) : (
          <Form.Group>
            <Form.Label>Owner</Form.Label>
            <Form.Select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              disabled={disabled}
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({roleLabel(u.role)})
                  {u.id === server.ownerId ? " · current" : ""}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={disabled || ownerId === (server.ownerId ?? "")}
          onClick={() => void onSave()}
        >
          {saving ? <Spinner size="sm" /> : "Save owner"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
