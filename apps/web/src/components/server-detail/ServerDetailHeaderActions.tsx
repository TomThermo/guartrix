import type { ServerDetail, ServerPermission } from "@guartrix/shared";
import { Button, Dropdown } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export function ServerDetailHeaderActions({
  server,
  isAdmin,
  canClone,
  busy,
  can,
  canPowerStart,
  canPowerStop,
  canPowerKill,
  canPowerRestart,
  onShowTransfer,
  onShowVersionPicker,
  onShowChangeType,
  onShowClone,
  onShowReinstall,
  onShowNodeTransfer,
  onRequestStart,
  onStop,
  onKill,
  onRestart,
}: {
  server: ServerDetail;
  isAdmin: boolean;
  canClone: boolean;
  busy: boolean;
  can: (p: ServerPermission | ServerPermission[]) => boolean;
  canPowerStart: boolean;
  canPowerStop: boolean;
  canPowerKill: boolean;
  canPowerRestart: boolean;
  onShowTransfer: () => void;
  onShowVersionPicker: () => void;
  onShowChangeType: () => void;
  onShowClone: () => void;
  onShowReinstall: () => void;
  onShowNodeTransfer: () => void;
  onRequestStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
}) {
  const { t } = useI18n();
  const isStopped = server.status === "STOPPED" || server.status === "ERROR";
  const isCreating = server.status === "CREATING";
  const showPower = canPowerStart || canPowerStop || canPowerKill || canPowerRestart;
  const showActions = canClone || isAdmin || can("settings.update");
  const powerBusy = busy || isCreating;

  if (!showPower && !showActions) return null;

  const manageMenu = (
    <>
      <Dropdown.Header>{t("serverDetail.serverActions")}</Dropdown.Header>
      {can("settings.update") && (
        <Dropdown.Item as="button" disabled={busy} onClick={onShowVersionPicker}>
          <i className="fa-solid fa-code-branch fa-fw me-2 text-secondary" />
          {t("serverDetail.changeVersion")}
        </Dropdown.Item>
      )}
      {can("settings.update") && (
        <Dropdown.Item as="button" disabled={busy} onClick={onShowChangeType}>
          <i className="fa-solid fa-puzzle-piece fa-fw me-2 text-secondary" />
          {t("serverDetail.changeSoftware")}
        </Dropdown.Item>
      )}
      {canClone && (
        <Dropdown.Item as="button" disabled={busy} onClick={onShowClone}>
          <i className="fa-solid fa-clone fa-fw me-2 text-secondary" />
          {t("serverDetail.cloneServer")}
        </Dropdown.Item>
      )}
      {can("settings.update") && (
        <Dropdown.Item as="button" disabled={busy} onClick={onShowReinstall}>
          <i className="fa-solid fa-rotate fa-fw me-2 text-secondary" />
          {t("serverDetail.reinstall")}
        </Dropdown.Item>
      )}
      {isAdmin && (
        <>
          <Dropdown.Divider />
          <Dropdown.Item
            as="button"
            disabled={busy || server.status === "TRANSFERRING"}
            onClick={onShowNodeTransfer}
          >
            <i className="fa-solid fa-right-left fa-fw me-2 text-secondary" />
            {t("serverDetail.moveToNode")}
          </Dropdown.Item>
          <Dropdown.Item as="button" disabled={busy} onClick={onShowTransfer}>
            <i className="fa-solid fa-user-tag fa-fw me-2 text-secondary" />
            {t("serverDetail.transferOwnerAction")}
          </Dropdown.Item>
        </>
      )}
    </>
  );

  return (
    <div className="server-detail-header__actions">
      {showPower && (
        <div
          className="server-power-strip btn-group btn-group-sm"
          role="group"
          aria-label={t("console.controls")}
        >
          {canPowerStart && (
            <Button
              variant="success"
              disabled={
                powerBusy ||
                server.status === "RUNNING" ||
                server.status === "STARTING" ||
                isCreating
              }
              title={t("common.start")}
              onClick={onRequestStart}
            >
              <i className="fa-solid fa-play" aria-hidden />
              <span className="btn-label">{t("common.start")}</span>
            </Button>
          )}
          {canPowerStop && (
            <Button
              variant="danger"
              className="server-control-stop"
              disabled={powerBusy || isStopped || isCreating}
              title={t("common.stop")}
              onClick={onStop}
            >
              <i className="fa-solid fa-stop" aria-hidden />
              <span className="btn-label">{t("common.stop")}</span>
            </Button>
          )}
          {canPowerRestart && (
            <Button
              variant="primary"
              className="server-control-restart"
              disabled={powerBusy || isCreating}
              title={t("common.restart")}
              onClick={onRestart}
            >
              <i className="fa-solid fa-rotate-right" aria-hidden />
              <span className="btn-label">{t("common.restart")}</span>
            </Button>
          )}
          {canPowerKill && (
            <Button
              variant="warning"
              className="server-control-kill"
              disabled={powerBusy || isStopped || isCreating}
              title={t("console.killTitle")}
              onClick={onKill}
            >
              <i className="fa-solid fa-skull-crossbones" aria-hidden />
              <span className="btn-label">{t("common.kill")}</span>
            </Button>
          )}
        </div>
      )}

      {showActions && (
        <>
          <div className="server-toolbar btn-group btn-group-sm" role="group">
            {can("settings.update") && (
              <Button
                variant="outline-secondary"
                disabled={busy}
                title={t("serverDetail.changeVersionTitle")}
                onClick={onShowVersionPicker}
              >
                <i className="fa-solid fa-code-branch" />
                <span className="btn-label">{t("serverDetail.version")}</span>
              </Button>
            )}
            {can("settings.update") && (
              <Button
                variant="outline-secondary"
                disabled={busy}
                title={t("serverDetail.changeSoftwareTitle")}
                onClick={onShowChangeType}
              >
                <i className="fa-solid fa-puzzle-piece" />
                <span className="btn-label">{t("serverDetail.software")}</span>
              </Button>
            )}
            {canClone && (
              <Button
                variant="outline-secondary"
                disabled={busy}
                title={t("serverDetail.cloneServer")}
                onClick={onShowClone}
              >
                <i className="fa-solid fa-clone" />
                <span className="btn-label">{t("serverDetail.clone")}</span>
              </Button>
            )}
            {can("settings.update") && (
              <Button
                variant="outline-secondary"
                disabled={busy}
                title={t("serverDetail.reinstallTitle")}
                onClick={onShowReinstall}
              >
                <i className="fa-solid fa-rotate" />
                <span className="btn-label">{t("serverDetail.reinstall")}</span>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline-secondary"
                disabled={busy || server.status === "TRANSFERRING"}
                title={t("serverDetail.moveTitle")}
                onClick={onShowNodeTransfer}
              >
                <i className="fa-solid fa-right-left" />
                <span className="btn-label">{t("serverDetail.move")}</span>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline-secondary"
                disabled={busy}
                title={t("serverDetail.transferOwnerAction")}
                onClick={onShowTransfer}
              >
                <i className="fa-solid fa-user-tag" />
                <span className="btn-label">{t("serverDetail.owner")}</span>
              </Button>
            )}
          </div>

          <Dropdown align="end" className="server-manage-dropdown">
            <Dropdown.Toggle
              variant="outline-secondary"
              size="sm"
              id={`server-manage-${server.id}`}
              className="server-manage-toggle"
              disabled={busy}
            >
              <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
              <span>{t("serverDetail.manage")}</span>
            </Dropdown.Toggle>
            <Dropdown.Menu className="server-manage-menu">{manageMenu}</Dropdown.Menu>
          </Dropdown>
        </>
      )}
    </div>
  );
}
