import { useCallback, useEffect, useState } from "react";
import type { McServer, ServerUpdateInfo } from "@msm/shared";
import { Alert, Button, Spinner } from "react-bootstrap";
import { api } from "../api";
import { typeLabel } from "../utils";

interface Props {
  server: McServer;
  onUpdated: (server: McServer) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

/** Only shown when a channel / Minecraft update is available. */
export function UpdateBanner({
  server,
  onUpdated,
  onError,
  onNotice,
}: Props) {
  const [info, setInfo] = useState<ServerUpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);

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

  const running =
    server.status === "RUNNING" ||
    server.status === "STARTING" ||
    server.status === "STOPPING";

  async function apply(mcVersion: string, label: string) {
    if (running) {
      onError("Stop the server before updating.");
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

  if (!info?.available) return null;

  return (
    <Alert
      variant="warning"
      className="d-flex flex-wrap justify-content-between gap-3 align-items-start mb-3"
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
  );
}
