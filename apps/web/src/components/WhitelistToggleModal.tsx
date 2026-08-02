import { useEffect, useState } from "react";
import type { ServerDetail } from "@msm/shared";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";

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
      onError(err instanceof Error ? err.message : "Failed to update whitelist");
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
          Whitelist
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-secondary small mb-3">
          Control whether only listed players can join{" "}
          <strong>{server.name}</strong>.
          {server.status === "RUNNING"
            ? " Changes apply on the running server."
            : " Applies on next start."}
        </p>
        <Form className="d-grid gap-3">
          <Form.Group>
            <Form.Label className="small mb-1">Whitelist</Form.Label>
            <Form.Select
              value={enabled}
              disabled={locked}
              onChange={(e) => setEnabled(e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label className="small mb-1">Enforce whitelist</Form.Label>
            <Form.Select
              value={enforce}
              disabled={locked}
              onChange={(e) => setEnforce(e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Form.Select>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={locked} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={locked} onClick={() => void save()}>
          {saving ? <Spinner size="sm" /> : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
