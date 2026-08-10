import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ALL_SERVER_TYPES, addonKindFor, type McServer, type ServerType } from "@guartrix/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
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

export function ChangeTypeModal({ server, busy = false, onCancel, onDone }: Props) {
  const { t } = useI18n();
  const [type, setType] = useState<ServerType>(server.type);
  const [mcVersion, setMcVersion] = useState(server.mcVersion);
  const [versions, setVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [wipeAddons, setWipeAddons] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mustWipe = useMemo(() => requiresWipe(server.type, type), [server.type, type]);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    api
      .versions(type)
      .then((res) => {
        if (cancelled) return;
        setVersions(res.versions);
        setMcVersion((prev) => (res.versions.includes(prev) ? prev : (res.versions[0] ?? "")));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("createServer.versionsFailed"));
          setVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, t]);

  useEffect(() => {
    if (mustWipe) setWipeAddons(true);
  }, [mustWipe]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mcVersion) {
      setError(t("modals.changeTypeVersionRequired"));
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
      setError(err instanceof Error ? err.message : t("modals.changeTypeFailed"));
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
            {t("modals.changeTypeTitle")}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary small">
            {t("modals.changeTypeHelp", { name: server.name })}
          </p>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="change-type">
            <Form.Label>{t("modals.changeTypeSoftware")}</Form.Label>
            <Form.Select
              value={type}
              disabled={locked}
              onChange={(e) => setType(e.target.value as ServerType)}
            >
              {ALL_SERVER_TYPES.map((st) => (
                <option key={st} value={st}>
                  {typeLabel(st)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="change-version">
            <Form.Label>{t("common.version")}</Form.Label>
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
            label={t("modals.changeTypeWipeAddons")}
            checked={wipeAddons || mustWipe}
            disabled={locked || mustWipe}
            onChange={(e) => setWipeAddons(e.target.checked)}
          />
          {mustWipe && (
            <Alert variant="warning" className="py-2 small mb-0">
              {t("modals.changeTypeWipeRequired")}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={locked} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={locked || type === server.type}>
            {running ? <Spinner size="sm" /> : t("modals.changeTypeConfirm")}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
