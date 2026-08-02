import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ALL_SERVER_TYPES,
  addonKindFor,
  type McServer,
  type ServerType,
} from "@msm/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { typeLabel } from "../utils";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onDone: (server: McServer) => void;
}

function requiresWipe(from: ServerType, to: ServerType): boolean {
  const a = addonKindFor(from);
  const b = addonKindFor(to);
  if (!a || !b) return a !== b;
  return a !== b;
}

export function ChangeTypeModal({
  server,
  busy = false,
  onCancel,
  onDone,
}: Props) {
  const [type, setType] = useState<ServerType>(server.type);
  const [mcVersion, setMcVersion] = useState(server.mcVersion);
  const [versions, setVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [wipeAddons, setWipeAddons] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mustWipe = useMemo(
    () => requiresWipe(server.type, type),
    [server.type, type],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    api
      .versions(type)
      .then((res) => {
        if (cancelled) return;
        setVersions(res.versions);
        setMcVersion((prev) =>
          res.versions.includes(prev) ? prev : (res.versions[0] ?? ""),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load versions");
          setVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  useEffect(() => {
    if (mustWipe) setWipeAddons(true);
  }, [mustWipe]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mcVersion) {
      setError("Choose a Minecraft version.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const { server: next } = await api.changeServerType(server.id, {
        type,
        mcVersion,
        wipeAddons: wipeAddons || mustWipe,
      });
      onDone(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change type failed");
      setRunning(false);
    }
  }

  const locked = busy || running;

  return (
    <Modal show onHide={locked ? undefined : onCancel} centered backdrop="static">
      <Form onSubmit={(e) => void onSubmit(e)}>
        <Modal.Header closeButton={!locked}>
          <Modal.Title>
            <i className="fa-solid fa-shuffle me-2" />
            Change software
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary small">
            Switch loader for <strong>{server.name}</strong>. World is kept. A
            backup is created automatically. Server must be stopped.
          </p>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="change-type">
            <Form.Label>Software</Form.Label>
            <Form.Select
              value={type}
              disabled={locked}
              onChange={(e) => setType(e.target.value as ServerType)}
            >
              {ALL_SERVER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="change-version">
            <Form.Label>Minecraft version</Form.Label>
            <Form.Select
              value={mcVersion}
              disabled={locked || loadingVersions || versions.length === 0}
              onChange={(e) => setMcVersion(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Check
            type="switch"
            id="change-wipe-addons"
            className="mb-2"
            label="Wipe plugins / mods"
            checked={wipeAddons || mustWipe}
            disabled={locked || mustWipe}
            onChange={(e) => setWipeAddons(e.target.checked)}
          />
          {mustWipe && (
            <Alert variant="warning" className="py-2 small mb-0">
              Switching between plugins and mods requires wiping the addon folder.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={locked} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={locked || type === server.type}
          >
            {running ? <Spinner size="sm" /> : "Change software"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
