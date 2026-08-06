import type {
  ConnectInfo,
  OnlinePlayersResponse,
  ServerDetail,
  ServerPermission,
} from "@msm/shared";
import { Badge, Button, Dropdown } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { statusBadgeClass, typeIcon, typeLabel } from "../../utils";
import type { TabId } from "./server-tabs";

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
}) {
  const { t } = useI18n();

  return (
    <div className="server-detail-header mb-3">
      <div className="server-detail-title-row">
        <Button
          variant="outline-secondary"
          className="server-burger-btn"
          onClick={onOpenMobileNav}
          aria-label={t("serverDetail.openMenu")}
        >
          <i className="fa-solid fa-bars" aria-hidden />
        </Button>
        <img
          className="server-icon-badge"
          src={`/api/servers/${server.id}/icon?t=${server.hasIcon ? server.updatedAt : "default"}`}
          alt=""
          width={40}
          height={40}
        />
        <div className="server-detail-title-text min-w-0">
          <h1 className="server-detail-name text-truncate">{server.name}</h1>
          <Button
            size="sm"
            variant="link"
            className="server-detail-address p-0 text-secondary text-decoration-none text-truncate"
            onClick={onCopyConnect}
            title={t("serverDetail.copyAddress")}
          >
            <i className="fa-solid fa-copy" aria-hidden />
            <span className="text-truncate">
              {connectInfo?.address ?? `:${server.port}`}
            </span>
          </Button>
          <span className={statusBadgeClass(server.status)}>{server.status}</span>
          <Badge bg="secondary">
            <i className={`fa-solid ${typeIcon(server.type)}`} aria-hidden />
            {typeLabel(server.type)}
          </Badge>
          {isAdmin || server.ownerUsername ? (
            <Badge
              bg={server.ownerUsername ? "dark" : "secondary"}
              title={
                isAdmin ? t("serverDetail.transferOwner") : t("serverDetail.owner")
              }
              role={isAdmin ? "button" : undefined}
              style={isAdmin ? { cursor: "pointer" } : undefined}
              onClick={isAdmin ? onShowTransfer : undefined}
            >
              <i className="fa-solid fa-user" aria-hidden />
              {server.ownerUsername ?? t("serverDetail.unassigned")}
            </Badge>
          ) : null}
          <span className="server-detail-meta-text">
            {[
              server.mcVersion,
              server.fabricLoaderVersion
                ? `loader ${server.fabricLoaderVersion}`
                : null,
              server.forgeVersion ? `forge ${server.forgeVersion}` : null,
              server.paperBuild ? `build ${server.paperBuild}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {can("player.read") && (
            <Badge
              bg="secondary"
              className="server-detail-meta-action"
              role="button"
              tabIndex={0}
              title={t("serverDetail.onlinePlayersTitle")}
              onClick={() => onChangeTab("players")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChangeTab("players");
                }
              }}
            >
              <i className="fa-solid fa-users" aria-hidden />
              {online
                ? `${online.playersOnline}${online.playersMax > 0 ? `/${online.playersMax}` : ""}`
                : server.status === "RUNNING"
                  ? "…/…"
                  : "0/0"}
            </Badge>
          )}
          {can("settings.read") && (
            <Badge
              bg={whitelistOn ? "success" : "warning"}
              text={whitelistOn ? undefined : "dark"}
              className="server-detail-meta-action"
              role="button"
              tabIndex={0}
              title={
                can("settings.update")
                  ? t("serverDetail.clickWhitelist")
                  : whitelistOn
                    ? t("serverDetail.whitelistEnabled")
                    : t("serverDetail.whitelistDisabled")
              }
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
            >
              <i
                className={`fa-solid ${whitelistOn ? "fa-shield-halved" : "fa-shield"}`}
                aria-hidden
              />
              {whitelistOn ? t("serverDetail.wlOn") : t("serverDetail.wlOff")}
            </Badge>
          )}
          {supportsAddons && can("addon.read") && (
            <Badge
              bg={addonUpdateCount > 0 ? "danger" : "secondary"}
              className="server-detail-meta-action"
              role="button"
              tabIndex={0}
              title={t("serverDetail.openAddons")}
              onClick={() => onChangeTab("addons")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChangeTab("addons");
                }
              }}
            >
              <i className="fa-solid fa-puzzle-piece" aria-hidden />
              {addonUpdateCount > 0
                ? addonUpdateCount === 1
                  ? t("common.updateOne", { count: addonUpdateCount })
                  : t("common.updateMany", { count: addonUpdateCount })
                : t("serverDetail.upToDate")}
            </Badge>
          )}
          {server.autoRestart && (
            <Badge bg="info" text="dark">
              {t("serverDetail.autoRestart")}
            </Badge>
          )}
        </div>
        {(canClone || isAdmin || can("settings.update")) && (
          <>
            <div
              className="server-toolbar btn-group btn-group-sm"
              role="group"
            >
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
              <Dropdown.Menu className="server-manage-menu">
                <Dropdown.Header>{t("serverDetail.serverActions")}</Dropdown.Header>
                {can("settings.update") && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowVersionPicker}
                  >
                    <i className="fa-solid fa-code-branch fa-fw me-2 text-secondary" />
                    {t("serverDetail.changeVersion")}
                  </Dropdown.Item>
                )}
                {can("settings.update") && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowChangeType}
                  >
                    <i className="fa-solid fa-puzzle-piece fa-fw me-2 text-secondary" />
                    {t("serverDetail.changeSoftware")}
                  </Dropdown.Item>
                )}
                {canClone && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowClone}
                  >
                    <i className="fa-solid fa-clone fa-fw me-2 text-secondary" />
                    {t("serverDetail.cloneServer")}
                  </Dropdown.Item>
                )}
                {can("settings.update") && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowReinstall}
                  >
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
                    <Dropdown.Item
                      as="button"
                      disabled={busy}
                      onClick={onShowTransfer}
                    >
                      <i className="fa-solid fa-user-tag fa-fw me-2 text-secondary" />
                      {t("serverDetail.transferOwnerAction")}
                    </Dropdown.Item>
                  </>
                )}
              </Dropdown.Menu>
            </Dropdown>
          </>
        )}
      </div>
    </div>
  );
}
