import type { KeyboardEvent } from "react";
// size-budget: ignore — server header actions bar; split modals/actions when stable
import type {
  ConnectInfo,
  OnlinePlayersResponse,
  ServerDetail,
  ServerPermission,
} from "@guartrix/shared";
import { Button, Dropdown } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { statusBadgeClass, typeIcon, typeLabel } from "../../utils";
import type { TabId } from "./server-tabs";

type OnlineInfo = Pick<OnlinePlayersResponse, "playersOnline" | "playersMax"> | null;

function StatChip({
  icon,
  label,
  title,
  tone = "neutral",
  onClick,
  onKeyDown,
}: {
  icon: string;
  label: string;
  title?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <span
      className={`server-detail-stat server-detail-stat--${tone}${
        interactive ? " is-clickable" : ""
      }`}
      title={title}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <i className={`fa-solid ${icon}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function ServerDetailHeader({
  server,
  connectInfo,
  online,
  isAdmin,
  canClone,
  busy,
  whitelistOn,
  supportsAddons,
  addonUpdateCount,
  can,
  canPowerStart,
  canPowerStop,
  canPowerKill,
  canPowerRestart,
  onOpenMobileNav,
  onCopyConnect,
  onChangeTab,
  onShowTransfer,
  onShowWhitelistModal,
  onShowVersionPicker,
  onShowChangeType,
  onShowClone,
  onShowReinstall,
  onShowNodeTransfer,
  onRequestStart,
  onStop,
  onKill,
  onRestart,
  onEditIcon,
}: {
  server: ServerDetail;
  connectInfo: ConnectInfo | null;
  online: OnlineInfo;
  isAdmin: boolean;
  canClone: boolean;
  busy: boolean;
  whitelistOn: boolean;
  supportsAddons: boolean;
  addonUpdateCount: number;
  can: (p: ServerPermission | ServerPermission[]) => boolean;
  canPowerStart: boolean;
  canPowerStop: boolean;
  canPowerKill: boolean;
  canPowerRestart: boolean;
  onOpenMobileNav: () => void;
  onCopyConnect: () => void;
  onChangeTab: (tab: TabId) => void;
  onShowTransfer: () => void;
  onShowWhitelistModal: () => void;
  onShowVersionPicker: () => void;
  onShowChangeType: () => void;
  onShowClone: () => void;
  onShowReinstall: () => void;
  onShowNodeTransfer: () => void;
  onRequestStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onEditIcon?: () => void;
}) {
  const { t } = useI18n();
  const isStopped = server.status === "STOPPED" || server.status === "ERROR";
  const isCreating = server.status === "CREATING";
  const showPower =
    canPowerStart || canPowerStop || canPowerKill || canPowerRestart;
  const canEditIcon = Boolean(onEditIcon) && can("settings.update");

  const versionLine = [
    server.mcVersion,
    server.fabricLoaderVersion ? `loader ${server.fabricLoaderVersion}` : null,
    server.forgeVersion ? `forge ${server.forgeVersion}` : null,
    server.paperBuild ? `build ${server.paperBuild}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const showActions = canClone || isAdmin || can("settings.update");
  const powerBusy = busy || isCreating;

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
    <header className="server-detail-header mb-3">
      <div className="server-detail-header__main">
        <Button
          variant="outline-secondary"
          className="server-burger-btn"
          onClick={onOpenMobileNav}
          aria-label={t("serverDetail.openMenu")}
        >
          <i className="fa-solid fa-bars" aria-hidden />
        </Button>

        {canEditIcon ? (
          <button
            type="button"
            className="server-detail-header__icon-btn"
            onClick={onEditIcon}
            title={t("serverIcon.editTitle")}
            aria-label={t("serverIcon.editTitle")}
          >
            <img
              className="server-detail-header__icon"
              src={`/api/servers/${server.id}/icon?t=${server.hasIcon ? server.updatedAt : "default"}`}
              alt=""
              width={48}
              height={48}
            />
            <span className="server-detail-header__icon-edit" aria-hidden>
              <i className="fa-solid fa-pen" />
            </span>
          </button>
        ) : (
          <img
            className="server-detail-header__icon"
            src={`/api/servers/${server.id}/icon?t=${server.hasIcon ? server.updatedAt : "default"}`}
            alt=""
            width={48}
            height={48}
          />
        )}

        <div className="server-detail-header__identity min-w-0">
          <div className="server-detail-header__title-row">
            <h1 className="server-detail-header__name text-truncate">{server.name}</h1>
            <span className={`server-detail-header__status ${statusBadgeClass(server.status)}`}>
              {server.status}
            </span>
          </div>
          <button
            type="button"
            className="server-detail-header__address"
            onClick={onCopyConnect}
            title={t("serverDetail.copyAddress")}
          >
            <i className="fa-solid fa-copy" aria-hidden />
            <span className="text-truncate">{connectInfo?.address ?? `:${server.port}`}</span>
          </button>
          {versionLine ? <div className="server-detail-header__version">{versionLine}</div> : null}
        </div>

        {(showPower || showActions) && (
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
        )}
      </div>

      <div className="server-detail-header__stats">
        <StatChip
          icon={typeIcon(server.type)}
          label={typeLabel(server.type)}
          title={typeLabel(server.type)}
        />
        {(isAdmin || server.ownerUsername) && (
          <StatChip
            icon="fa-user"
            label={server.ownerUsername ?? t("serverDetail.unassigned")}
            title={isAdmin ? t("serverDetail.transferOwner") : t("serverDetail.owner")}
            onClick={isAdmin ? onShowTransfer : undefined}
          />
        )}
        {can("player.read") && (
          <StatChip
            icon="fa-users"
            label={
              online
                ? `${online.playersOnline}${online.playersMax > 0 ? `/${online.playersMax}` : ""}`
                : server.status === "RUNNING"
                  ? "…/…"
                  : "0/0"
            }
            title={t("serverDetail.onlinePlayersTitle")}
            onClick={() => onChangeTab("players")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChangeTab("players");
              }
            }}
          />
        )}
        {can("settings.read") && (
          <StatChip
            icon={whitelistOn ? "fa-shield-halved" : "fa-shield"}
            label={whitelistOn ? t("serverDetail.wlOn") : t("serverDetail.wlOff")}
            title={
              can("settings.update")
                ? t("serverDetail.clickWhitelist")
                : whitelistOn
                  ? t("serverDetail.whitelistEnabled")
                  : t("serverDetail.whitelistDisabled")
            }
            tone={whitelistOn ? "success" : "warning"}
            onClick={() => {
              if (can("settings.update")) onShowWhitelistModal();
              else onChangeTab("whitelist");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (can("settings.update")) onShowWhitelistModal();
                else onChangeTab("whitelist");
              }
            }}
          />
        )}
        {supportsAddons && can("addon.read") && (
          <StatChip
            icon="fa-puzzle-piece"
            label={
              addonUpdateCount > 0
                ? addonUpdateCount === 1
                  ? t("common.updateOne", { count: addonUpdateCount })
                  : t("common.updateMany", { count: addonUpdateCount })
                : t("serverDetail.upToDate")
            }
            title={t("serverDetail.openAddons")}
            tone={addonUpdateCount > 0 ? "danger" : "neutral"}
            onClick={() => onChangeTab("addons")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChangeTab("addons");
              }
            }}
          />
        )}
        {server.autoRestart && (
          <StatChip icon="fa-rotate" label={t("serverDetail.autoRestart")} tone="info" />
        )}
      </div>
    </header>
  );
}
