import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ServerDetail, ServerStatus } from "@msm/shared";
import { hasPermission, type ServerPermission } from "@msm/shared";
import { Alert, Badge, Button, Spinner, Stack } from "react-bootstrap";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Console } from "../components/Console";
import { ConsoleOnlineHeads } from "../components/ConsoleOnlineHeads";
import { useI18n } from "../i18n/react";

function statusVariant(status: ServerStatus): string {
  switch (status) {
    case "RUNNING":
      return "success";
    case "STARTING":
      return "warning";
    case "STOPPED":
      return "secondary";
    default:
      return "secondary";
  }
}

export function ServerConsolePage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consoleNotices, setConsoleNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const perms = server?.permissions ?? (user?.role === "ADMIN" ? ["*"] : []);
  const can = (p: ServerPermission) => hasPermission(perms, p);
  const canSendConsole = can("control.console");
  const canViewPlayers = can("player.read");
  const canManagePlayers = can("player.update");
  const canPowerStart = can("control.start");
  const canPowerStop = can("control.stop");
  const canPowerKill = can("control.kill");
  const canPowerRestart = can("control.restart");
  const serverActive = server?.status === "RUNNING" || server?.status === "STARTING";

  const load = useCallback(async () => {
    try {
      const s = await api.getServer(id);
      setServer(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.loadFailed"));
      setServer(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onStatus = useCallback((status: ServerStatus) => {
    setServer((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  async function act(action: "start" | "stop" | "restart" | "kill") {
    setBusy(true);
    setError(null);
    try {
      if (action === "start") await api.startServer(id);
      else if (action === "stop") await api.stopServer(id);
      else if (action === "kill") await api.killServer(id);
      else await api.restartServer(id);
      if (action === "start" || action === "restart") {
        setConsoleNotices([]);
      }
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      const licenseCode = err instanceof ApiError ? String(err.code ?? "") : "";
      const licenseBlocked =
        (action === "start" || action === "restart") &&
        (licenseCode === "LICENSE_INVALID" ||
          licenseCode === "LICENSE_QUOTA" ||
          /license/i.test(message));
      if (licenseBlocked) {
        const line =
          message && /license|administrator|RAM|server limit/i.test(message)
            ? message.startsWith("ERROR:")
              ? message
              : `ERROR: ${message}`
            : "ERROR: Cannot start — panel license expired or invalid. Please contact your administrator.";
        setConsoleNotices([line]);
      } else {
        setError(message);
      }
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="console-popout-page d-flex justify-content-center align-items-center min-vh-100">
        <Spinner animation="border" role="status" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="console-popout-page p-3">
        <Alert variant="danger">{error ?? t("common.loadFailed")}</Alert>
      </div>
    );
  }

  if (!canSendConsole && !canPowerStart && !canPowerStop && !can("control.console.read")) {
    return (
      <div className="console-popout-page p-3">
        <Alert variant="warning">{t("console.popoutForbidden")}</Alert>
      </div>
    );
  }

  const isStopped = server.status === "STOPPED";

  return (
    <div className="console-popout-page">
      <header className="console-popout-header">
        <Stack direction="horizontal" gap={2} className="align-items-center flex-wrap">
          <strong className="console-popout-title">{server.name}</strong>
          <Badge bg={statusVariant(server.status)}>{server.status}</Badge>
          <div className="flex-grow-1" />
          {canPowerStart && (
            <Button
              size="sm"
              variant="success"
              disabled={busy || server.status === "RUNNING" || server.status === "STARTING"}
              onClick={() => void act("start")}
            >
              <i className="fa-solid fa-play me-1" />
              {t("common.start")}
            </Button>
          )}
          {canPowerStop && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy || isStopped}
              onClick={() => void act("stop")}
            >
              <i className="fa-solid fa-stop me-1" />
              {t("common.stop")}
            </Button>
          )}
          {canPowerKill && (
            <Button
              size="sm"
              variant="warning"
              disabled={busy || isStopped}
              onClick={() => void act("kill")}
            >
              <i className="fa-solid fa-skull-crossbones me-1" />
              {t("common.kill")}
            </Button>
          )}
          {canPowerRestart && (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void act("restart")}>
              <i className="fa-solid fa-rotate-right me-1" />
              {t("common.restart")}
            </Button>
          )}
          <Link to={`/servers/${id}`} className="btn btn-sm btn-outline-secondary">
            <i className="fa-solid fa-arrow-up-right-from-square me-1" />
            {t("console.backToServer")}
          </Link>
        </Stack>
        {error && (
          <Alert variant="danger" className="mt-2 mb-0 py-2 small">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert variant="info" className="mt-2 mb-0 py-2 small">
            {notice}
          </Alert>
        )}
      </header>
      <div className="console-popout-body">
        {canViewPlayers && (
          <ConsoleOnlineHeads
            serverId={id}
            active={serverActive}
            canUpdate={canManagePlayers}
            onError={setError}
            onNotice={setNotice}
          />
        )}
        <Console
          serverId={id}
          onStatus={onStatus}
          canSend={canSendConsole}
          panelNotices={consoleNotices}
        />
      </div>
    </div>
  );
}
