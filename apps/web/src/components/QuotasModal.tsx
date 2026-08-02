import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@msm/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { RamGbSelect } from "./RamGbSelect";

interface Props {
  user: AuthUser;
  hostMemoryGb: number;
  onCancel: () => void;
  onSaved: (user: AuthUser) => void;
}

export function QuotasModal({ user, hostMemoryGb, onCancel, onSaved }: Props) {
  const defaultGb = useMemo(() => {
    if (user.maxMemoryMb == null) return Math.min(4, hostMemoryGb);
    return Math.min(
      hostMemoryGb,
      Math.max(1, Math.round(user.maxMemoryMb / 1024)),
    );
  }, [user.maxMemoryMb, hostMemoryGb]);

  const [maxServers, setMaxServers] = useState(user.maxServers ?? 1);
  const [unlimitedServers, setUnlimitedServers] = useState(user.maxServers == null);
  const [maxMemoryGb, setMaxMemoryGb] = useState(defaultGb);
  const [unlimitedRam, setUnlimitedRam] = useState(user.maxMemoryMb == null);
  const [maxDatabases, setMaxDatabases] = useState(user.maxDatabases ?? 3);
  const [unlimitedDatabases, setUnlimitedDatabases] = useState(
    user.maxDatabases == null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMaxServers(user.maxServers ?? 1);
    setUnlimitedServers(user.maxServers == null);
    setMaxMemoryGb(defaultGb);
    setUnlimitedRam(user.maxMemoryMb == null);
    setMaxDatabases(user.maxDatabases ?? 3);
    setUnlimitedDatabases(user.maxDatabases == null);
    setError(null);
  }, [user, defaultGb]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateUser(user.id, {
        maxServers: unlimitedServers ? null : maxServers,
        maxMemoryMb: unlimitedRam ? null : maxMemoryGb * 1024,
        maxDatabases: unlimitedDatabases ? null : maxDatabases,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show onHide={saving ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!saving}>
        <Modal.Title>
          <i className="fa-solid fa-sliders me-2 text-primary" />
          Quotas — {user.username}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form.Group className="mb-3" controlId="quota-max-servers">
          <Form.Label>Max servers</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={maxServers}
            disabled={unlimitedServers || saving}
            onChange={(e) => setMaxServers(Number(e.target.value))}
          />
          <Form.Check
            className="mt-2"
            type="checkbox"
            id="quota-unlimited-servers"
            label="Unlimited servers"
            checked={unlimitedServers}
            disabled={saving}
            onChange={(e) => setUnlimitedServers(e.target.checked)}
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="quota-max-ram">
          <Form.Label>Max total RAM</Form.Label>
          <RamGbSelect
            id="quota-max-ram"
            valueGb={maxMemoryGb}
            maxGb={hostMemoryGb}
            disabled={unlimitedRam || saving}
            onChangeGb={setMaxMemoryGb}
          />
          <Form.Check
            className="mt-2"
            type="checkbox"
            id="quota-unlimited-ram"
            label="Unlimited RAM"
            checked={unlimitedRam}
            disabled={saving}
            onChange={(e) => setUnlimitedRam(e.target.checked)}
          />
          <Form.Text className="text-secondary">
            Shared across all of this user&apos;s servers (host has {hostMemoryGb} GB).
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-0" controlId="quota-max-databases">
          <Form.Label>Max databases</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={maxDatabases}
            disabled={unlimitedDatabases || saving}
            onChange={(e) => setMaxDatabases(Number(e.target.value))}
          />
          <Form.Check
            className="mt-2"
            type="checkbox"
            id="quota-unlimited-databases"
            label="Unlimited databases"
            checked={unlimitedDatabases}
            disabled={saving}
            onChange={(e) => setUnlimitedDatabases(e.target.checked)}
          />
          <Form.Text className="text-secondary">
            Shared across all of this user&apos;s servers (default 3).
          </Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void onSave()} disabled={saving}>
          {saving ? (
            <>
              <Spinner size="sm" animation="border" className="me-2" />
              Saving…
            </>
          ) : (
            "Save quotas"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
