import { useCallback, useEffect, useState } from "react";
import type { McServer, ServerUpdateInfo } from "@msm/shared";
import { Alert, Button, Form, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";
import { typeLabel } from "../utils";

interface Props {
  server: McServer;
  onUpdated: (server: McServer) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  /** Show full version picker even when no update is available. */
  showVersionPicker?: boolean;
  onChangeType?: () => void;
}

export function UpdateBanner({
  server,
  onUpdated,
  onError,
  onNotice,
  showVersionPicker = true,
  onChangeType,
}: Props) {
  const [info, setInfo] = useState<ServerUpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<string[]>([]);
  const [pickVersion, setPickVersion] = useState(server.mcVersion);

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
  }, [
    refresh,
    server.mcVersion,
    server.paperBuild,
    server.fabricLoaderVersion,
    server.forgeVersion,
  ]);

  useEffect(() => {
    let cancelled = false;
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
  }, [server.type, server.mcVersion]);

  const running =
    server.status === "RUNNING" ||
    server.status === "STARTING" ||
    server.status === "STOPPING";

  async function apply(mcVersion: string, label: string) {
    if (running) {
      onError("Stop the server before updating.");
      return;
    }
    const isDowngrade =
      versions.indexOf(mcVersion) > versions.indexOf(server.mcVersion);
    const warnMc =
      mcVersion !== server.mcVersion
        ? `\n\nThis changes Minecraft ${server.mcVersion} → ${mcVersion}.${
            isDowngrade
              ? " Downgrading may corrupt the world or break plugins/mods."
              : " Plugins/mods may need matching versions."
          }`
        : "";
    if (
      !confirm(
        `Update ${server.name}?\n\n${label}${warnMc}\n\nA pre-update backup will be created automatically.`,
      )
    ) {
      return;
    }

    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.applyServerUpdate(server.id, mcVersion);
      onUpdated(result.server);
      setInfo(result.update);
      onNotice(`Updated successfully: ${label}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const showUpdateAlert = !!info?.available;

  return (
    <Stack gap={2} className="mb-3">
      {showUpdateAlert && (
        <Alert
          variant="warning"
          className="d-flex flex-wrap justify-content-between gap-3 align-items-start mb-0"
        >
          <div>
            <div className="fw-semibold">
              <i className="fa-solid fa-arrow-up me-2" />
              Update available
            </div>
            <div className="small mb-0">{info.message}</div>
            {running && (
              <div className="small text-muted mt-1">
                Stop the server to apply an update.
              </div>
            )}
          </div>
          <div className="d-flex flex-wrap gap-2">
            {info.channelUpdateAvailable && (
              <Button
                size="sm"
                variant="warning"
                disabled={busy || running}
                onClick={() =>
                  void apply(
                    info.currentMcVersion,
                    info.latestChannelLabel
                      ? `${typeLabel(info.type)} ${info.latestChannelLabel}`
                      : `channel update (${info.currentMcVersion})`,
                  )
                }
              >
                {busy ? (
                  <Spinner size="sm" />
                ) : (
                  `Update ${info.latestChannelLabel ?? "build"}`
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
                  )
                }
              >
                Update to {info.latestMcVersion}
              </Button>
            )}
          </div>
        </Alert>
      )}

      {showVersionPicker && (
        <Alert variant="light" className="border mb-0">
          <div className="fw-semibold mb-2">
            <i className="fa-solid fa-code-branch me-2" />
            Version &amp; software
          </div>
          <Stack
            direction="horizontal"
            gap={2}
            className="flex-wrap align-items-end"
          >
            <Form.Group controlId="pick-mc-version" className="mb-0">
              <Form.Label className="small text-secondary mb-1">
                Minecraft version
              </Form.Label>
              <Form.Select
                size="sm"
                style={{ minWidth: 140 }}
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
            </Form.Group>
            <Button
              size="sm"
              variant="outline-primary"
              disabled={
                busy ||
                running ||
                !pickVersion ||
                pickVersion === server.mcVersion
              }
              onClick={() =>
                void apply(
                  pickVersion,
                  `Minecraft ${server.mcVersion} → ${pickVersion}`,
                )
              }
            >
              {busy ? <Spinner size="sm" /> : "Apply version"}
            </Button>
            {onChangeType && (
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={busy || running}
                onClick={onChangeType}
              >
                Change software…
              </Button>
            )}
          </Stack>
          {running && (
            <div className="small text-muted mt-2">
              Stop the server to change version or software.
            </div>
          )}
        </Alert>
      )}
    </Stack>
  );
}
