import { useCallback, useEffect, useMemo, useState } from "react";
import {
  channelPinValue,
  supportsChannelBuilds,
  type McServer,
  type ServerUpdateInfo,
  type SoftwareBuildInfo,
} from "@guartrix/shared";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { typeLabel } from "../utils";

interface Props {
  server: McServer;
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

/** Only shown when a channel / Minecraft update is available. */
export function UpdateBanner({ server, onUpdated, onError, onNotice }: Props) {
  const { t } = useI18n();
  const [info, setInfo] = useState<ServerUpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [builds, setBuilds] = useState<SoftwareBuildInfo[]>([]);
  const [channelPin, setChannelPin] = useState("");
  const [loadingBuilds, setLoadingBuilds] = useState(false);

  const showChannel = supportsChannelBuilds(server.type);
  const targetMc = useMemo(() => {
    if (!info) return server.mcVersion;
    if (info.channelUpdateAvailable) return info.currentMcVersion;
    return info.suggestedMcVersion || info.latestMcVersion || server.mcVersion;
  }, [info, server.mcVersion]);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getServerUpdate(server.id);
      setInfo(next);
    } catch {
      setInfo(null);
    }
  }, [server.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!info?.available || !showChannel) {
      setBuilds([]);
      setChannelPin("");
      return;
    }
    let cancelled = false;
    setLoadingBuilds(true);
    void api
      .versionBuilds(server.type, targetMc)
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
  }, [info?.available, showChannel, server.type, targetMc]);

  const running =
    server.status === "RUNNING" || server.status === "STARTING" || server.status === "STOPPING";

  async function apply(mcVersion: string, label: string, withChannel: boolean) {
    if (running) {
      onError(t("modals.versionStopBeforeUpdate"));
      return;
    }
    if (
      !confirm(
        `Update ${server.name}?\n\n${label}\n\nA pre-update backup will be created automatically.`,
      )
    ) {
      return;
    }

    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.applyServerUpdate(server.id, {
        mcVersion,
        ...(withChannel ? channelBody(server.type, channelPin) : {}),
      });
      onUpdated(result.server);
      setInfo(result.update);
      onNotice(`Updated successfully: ${label}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("modals.versionUpdateFailed"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!info?.available) return null;

  return (
    <Alert
      variant="warning"
      className="d-flex flex-wrap justify-content-between gap-3 align-items-start mb-3"
    >
      <div className="flex-grow-1" style={{ minWidth: "12rem" }}>
        <div className="fw-semibold">
          <i className="fa-solid fa-arrow-up me-2" />
          {t("serverDetail.updateAvailable")}
        </div>
        <div className="small mb-0">{info.message}</div>
        {running && <div className="small text-muted mt-1">{t("modals.updateStopToApply")}</div>}
        {showChannel && (
          <Form.Group className="mt-2 mb-0" controlId={`update-channel-${server.id}`}>
            <Form.Label className="small mb-1">{t("modals.updateChannelPick")}</Form.Label>
            <Form.Select
              size="sm"
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
      </div>
      <div className="d-flex flex-wrap gap-2">
        {info.channelUpdateAvailable && (
          <Button
            size="sm"
            variant="warning"
            disabled={busy || running || (showChannel && !channelPin)}
            onClick={() =>
              void apply(
                info.currentMcVersion,
                channelPin
                  ? `${typeLabel(info.type)} ${channelPin}`
                  : info.latestChannelLabel
                    ? `${typeLabel(info.type)} ${info.latestChannelLabel}`
                    : `channel update (${info.currentMcVersion})`,
                true,
              )
            }
          >
            {busy ? (
              <Spinner size="sm" />
            ) : (
              t("modals.updateBuild", { label: channelPin || info.latestChannelLabel || "build" })
            )}
          </Button>
        )}
        {info.mcUpdateAvailable && (
          <Button
            size="sm"
            variant="outline-dark"
            disabled={busy || running}
            onClick={() =>
              void apply(
                info.latestMcVersion,
                `Minecraft ${info.currentMcVersion} → ${info.latestMcVersion}`,
                false,
              )
            }
          >
            {t("modals.updateTo", { version: info.latestMcVersion })}
          </Button>
        )}
      </div>
    </Alert>
  );
}
