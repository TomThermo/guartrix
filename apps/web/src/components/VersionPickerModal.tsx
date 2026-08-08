import { useEffect, useState } from "react";
import type { McServer } from "@msm/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  show: boolean;
  server: McServer;
  onHide: () => void;
  onUpdated: (server: McServer) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

export function VersionPickerModal({ show, server, onHide, onUpdated, onError, onNotice }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<string[]>([]);
  const [pickVersion, setPickVersion] = useState(server.mcVersion);

  const running =
    server.status === "RUNNING" || server.status === "STARTING" || server.status === "STOPPING";

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setPickVersion(server.mcVersion);
    api
      .versions(server.type)
      .then((res) => {
        if (cancelled) return;
        setVersions(res.versions);
        setPickVersion(
          res.versions.includes(server.mcVersion)
            ? server.mcVersion
            : (res.versions[0] ?? server.mcVersion),
        );
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [show, server.type, server.mcVersion]);

  async function apply() {
    if (running) {
      onError(t("modals.versionStopBeforeUpdate"));
      return;
    }
    if (!pickVersion || pickVersion === server.mcVersion) return;
    const isDowngrade = versions.indexOf(pickVersion) > versions.indexOf(server.mcVersion);
    if (
      !confirm(
        `Update ${server.name}?\n\nMinecraft ${server.mcVersion} → ${pickVersion}.${
          isDowngrade
            ? "\n\nDowngrading may corrupt the world or break plugins/mods."
            : "\n\nPlugins/mods may need matching versions."
        }\n\nA pre-update backup will be created automatically.`,
      )
    ) {
      return;
    }

    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.applyServerUpdate(server.id, pickVersion);
      onUpdated(result.server);
      onNotice(`Updated successfully: Minecraft ${server.mcVersion} → ${pickVersion}`);
      onHide();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("modals.versionUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title className="h5 mb-0">
          <i className="fa-solid fa-code-branch me-2" />
          {t("modals.versionTitle")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {running && (
          <Alert variant="warning" className="small py-2">
            {t("modals.versionStopFirst")}
          </Alert>
        )}
        <Form.Group controlId="modal-pick-mc-version">
          <Form.Label>{t("common.version")}</Form.Label>
          <Form.Select
            value={pickVersion}
            disabled={busy || running || versions.length === 0}
            onChange={(e) => setPickVersion(e.target.value)}
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Form.Select>
          <Form.Text muted>{t("modals.versionCurrent", { version: server.mcVersion })}</Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={busy} onClick={onHide}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={
            busy ||
            running ||
            !pickVersion ||
            pickVersion === server.mcVersion ||
            versions.length === 0
          }
          onClick={() => void apply()}
        >
          {busy ? <Spinner size="sm" /> : t("modals.versionApply")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
