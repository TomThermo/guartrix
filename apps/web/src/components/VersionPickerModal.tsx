import { useEffect, useState } from "react";
import {
  channelPinValue,
  supportsChannelBuilds,
  type McServer,
  type SoftwareBuildInfo,
} from "@guartrix/shared";
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

function channelBody(
  type: McServer["type"],
  pin: string,
): { paperBuild?: number; fabricLoaderVersion?: string; forgeVersion?: string } {
  if (!pin || !supportsChannelBuilds(type)) return {};
  if (type === "PAPER" || type === "PURPUR") {
    const n = Number(pin);
    return Number.isFinite(n) && n > 0 ? { paperBuild: n } : {};
  }
  if (type === "FABRIC" || type === "QUILT") return { fabricLoaderVersion: pin };
  if (type === "FORGE" || type === "NEOFORGE") return { forgeVersion: pin };
  return {};
}

export function VersionPickerModal({ show, server, onHide, onUpdated, onError, onNotice }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<string[]>([]);
  const [pickVersion, setPickVersion] = useState(server.mcVersion);
  const [builds, setBuilds] = useState<SoftwareBuildInfo[]>([]);
  const [channelPin, setChannelPin] = useState("");
  const [loadingBuilds, setLoadingBuilds] = useState(false);
  const showChannel = supportsChannelBuilds(server.type);

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

  useEffect(() => {
    if (!show || !showChannel || !pickVersion) {
      setBuilds([]);
      setChannelPin("");
      return;
    }
    let cancelled = false;
    setLoadingBuilds(true);
    void api
      .versionBuilds(server.type, pickVersion)
      .then((res) => {
        if (cancelled) return;
        setBuilds(res.builds);
        setChannelPin(res.builds[0] ? channelPinValue(res.builds[0]) : "");
      })
      .catch(() => {
        if (!cancelled) {
          setBuilds([]);
          setChannelPin("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBuilds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show, showChannel, server.type, pickVersion]);

  async function apply() {
    if (running) {
      onError(t("modals.versionStopBeforeUpdate"));
      return;
    }
    if (!pickVersion || pickVersion === server.mcVersion) {
      // Allow same MC with different channel pin
      if (!showChannel || !channelPin) return;
    }
    const isDowngrade = versions.indexOf(pickVersion) > versions.indexOf(server.mcVersion);
    if (
      !confirm(
        `Update ${server.name}?\n\nMinecraft ${server.mcVersion} → ${pickVersion}.${
          channelPin ? `\nChannel: ${channelPin}.` : ""
        }${
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
      const result = await api.applyServerUpdate(server.id, {
        mcVersion: pickVersion,
        ...channelBody(server.type, channelPin),
      });
      onUpdated(result.server);
      onNotice(
        `Updated successfully: Minecraft ${server.mcVersion} → ${pickVersion}${
          channelPin ? ` (${channelPin})` : ""
        }`,
      );
      onHide();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("modals.versionUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  const sameMcOnlyChannel =
    pickVersion === server.mcVersion && showChannel && Boolean(channelPin);

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
        <Form.Group controlId="modal-pick-mc-version" className={showChannel ? "mb-3" : ""}>
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
        {showChannel && (
          <Form.Group controlId="modal-pick-channel">
            <Form.Label>{t("modals.updateChannelPick")}</Form.Label>
            <Form.Select
              value={channelPin}
              disabled={busy || running || loadingBuilds || builds.length === 0}
              onChange={(e) => setChannelPin(e.target.value)}
            >
              {loadingBuilds && <option>{t("common.loading")}…</option>}
              {builds.map((b) => {
                const value = channelPinValue(b);
                return (
                  <option key={value} value={value}>
                    {b.version
                      ? `${b.version} (${b.channel})`
                      : `Build ${b.id} (${b.channel})`}
                  </option>
                );
              })}
            </Form.Select>
          </Form.Group>
        )}
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
            versions.length === 0 ||
            (pickVersion === server.mcVersion && !sameMcOnlyChannel) ||
            (showChannel && !channelPin)
          }
          onClick={() => void apply()}
        >
          {busy ? <Spinner size="sm" /> : t("modals.versionApply")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
