import type {
  ConnectInfo,
  OnlinePlayersResponse,
  ServerDetail,
  ServerPermission,
} from "@guartrix/shared";
import { Button } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { statusBadgeClass } from "../../utils";
import type { TabId } from "./server-tabs";
import { ServerDetailHeaderActions } from "./ServerDetailHeaderActions";
import { ServerDetailHeaderStats } from "./ServerDetailHeaderStats";

type OnlineInfo = Pick<OnlinePlayersResponse, "playersOnline" | "playersMax"> | null;

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
  const canEditIcon = Boolean(onEditIcon) && can("settings.update");

  const versionLine = [
    server.mcVersion,
    server.fabricLoaderVersion ? `loader ${server.fabricLoaderVersion}` : null,
    server.forgeVersion ? `forge ${server.forgeVersion}` : null,
    server.paperBuild ? `build ${server.paperBuild}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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

        <ServerDetailHeaderActions
          server={server}
          isAdmin={isAdmin}
          canClone={canClone}
          busy={busy}
          can={can}
          canPowerStart={canPowerStart}
          canPowerStop={canPowerStop}
          canPowerKill={canPowerKill}
          canPowerRestart={canPowerRestart}
          onShowTransfer={onShowTransfer}
          onShowVersionPicker={onShowVersionPicker}
          onShowChangeType={onShowChangeType}
          onShowClone={onShowClone}
          onShowReinstall={onShowReinstall}
          onShowNodeTransfer={onShowNodeTransfer}
          onRequestStart={onRequestStart}
          onStop={onStop}
          onKill={onKill}
          onRestart={onRestart}
        />
      </div>

      <ServerDetailHeaderStats
        server={server}
        online={online}
        isAdmin={isAdmin}
        whitelistOn={whitelistOn}
        supportsAddons={supportsAddons}
        addonUpdateCount={addonUpdateCount}
        can={can}
        onChangeTab={onChangeTab}
        onShowWhitelistModal={onShowWhitelistModal}
        onShowTransfer={onShowTransfer}
      />
    </header>
  );
}
