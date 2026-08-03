import type {
  ConnectInfo,
  OnlinePlayersResponse,
  ServerDetail,
  ServerPermission,
} from "@msm/shared";
import { Badge, Button, Dropdown } from "react-bootstrap";
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
  return (
    <div className="server-detail-header mb-3">
      <div className="server-detail-title-row">
        <Button
          variant="outline-secondary"
          className="server-burger-btn d-lg-none"
          onClick={onOpenMobileNav}
          aria-label="Open section menu"
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
          <div className="server-detail-name-line">
            <h1 className="server-detail-name text-truncate">{server.name}</h1>
            <Button
              size="sm"
              variant="link"
              className="server-detail-address p-0 text-secondary text-decoration-none text-truncate"
              onClick={onCopyConnect}
              title="Copy connect address"
            >
              <i className="fa-solid fa-copy" aria-hidden />
              <span className="text-truncate">
                {connectInfo?.address ?? `:${server.port}`}
              </span>
            </Button>
          </div>
          <div className="server-detail-meta">
            <span className={statusBadgeClass(server.status)}>{server.status}</span>
            <Badge bg="secondary">
              <i className={`fa-solid ${typeIcon(server.type)}`} aria-hidden />
              {typeLabel(server.type)}
            </Badge>
            {isAdmin || server.ownerUsername ? (
              <Badge
                bg={server.ownerUsername ? "dark" : "secondary"}
                title={isAdmin ? "Click to transfer owner" : "Owner"}
                role={isAdmin ? "button" : undefined}
                style={isAdmin ? { cursor: "pointer" } : undefined}
                onClick={isAdmin ? onShowTransfer : undefined}
              >
                <i className="fa-solid fa-user" aria-hidden />
                {server.ownerUsername ?? "Unassigned"}
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
                title="Online players — open Online Players"
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
                    ? "Click to change whitelist"
                    : whitelistOn
                      ? "Whitelist enabled"
                      : "Whitelist disabled"
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
                WL {whitelistOn ? "on" : "off"}
              </Badge>
            )}
            {supportsAddons && can("addon.read") && (
              <Badge
                bg={addonUpdateCount > 0 ? "danger" : "secondary"}
                className="server-detail-meta-action"
                role="button"
                tabIndex={0}
                title="Open Plugin Management"
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
                  ? `${addonUpdateCount} update${addonUpdateCount === 1 ? "" : "s"}`
                  : "Up to date"}
              </Badge>
            )}
            {server.autoRestart && (
              <Badge bg="info" text="dark">
                Auto-restart
              </Badge>
            )}
          </div>
        </div>
        {(canClone || isAdmin || can("settings.update")) && (
          <>
            <div
              className="server-toolbar d-none d-md-inline-flex btn-group btn-group-sm"
              role="group"
            >
              {can("settings.update") && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Change Minecraft version"
                  onClick={onShowVersionPicker}
                >
                  <i className="fa-solid fa-code-branch" />
                  <span className="btn-label">Version</span>
                </Button>
              )}
              {can("settings.update") && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Change software (Paper, Fabric, …)"
                  onClick={onShowChangeType}
                >
                  <i className="fa-solid fa-puzzle-piece" />
                  <span className="btn-label">Software</span>
                </Button>
              )}
              {canClone && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Clone server"
                  onClick={onShowClone}
                >
                  <i className="fa-solid fa-clone" />
                  <span className="btn-label">Clone</span>
                </Button>
              )}
              {can("settings.update") && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Reinstall server"
                  onClick={onShowReinstall}
                >
                  <i className="fa-solid fa-rotate" />
                  <span className="btn-label">Reinstall</span>
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline-secondary"
                  disabled={busy || server.status === "TRANSFERRING"}
                  title="Move to another node"
                  onClick={onShowNodeTransfer}
                >
                  <i className="fa-solid fa-right-left" />
                  <span className="btn-label">Move</span>
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Transfer owner"
                  onClick={onShowTransfer}
                >
                  <i className="fa-solid fa-user-tag" />
                  <span className="btn-label">Owner</span>
                </Button>
              )}
            </div>

            <Dropdown
              align="end"
              className="server-manage-dropdown d-md-none"
            >
              <Dropdown.Toggle
                variant="outline-secondary"
                size="sm"
                id={`server-manage-${server.id}`}
                className="server-manage-toggle"
                disabled={busy}
              >
                <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
                <span>Manage</span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="server-manage-menu">
                <Dropdown.Header>Server actions</Dropdown.Header>
                {can("settings.update") && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowVersionPicker}
                  >
                    <i className="fa-solid fa-code-branch fa-fw me-2 text-secondary" />
                    Change version
                  </Dropdown.Item>
                )}
                {can("settings.update") && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowChangeType}
                  >
                    <i className="fa-solid fa-puzzle-piece fa-fw me-2 text-secondary" />
                    Change software
                  </Dropdown.Item>
                )}
                {canClone && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowClone}
                  >
                    <i className="fa-solid fa-clone fa-fw me-2 text-secondary" />
                    Clone server
                  </Dropdown.Item>
                )}
                {can("settings.update") && (
                  <Dropdown.Item
                    as="button"
                    disabled={busy}
                    onClick={onShowReinstall}
                  >
                    <i className="fa-solid fa-rotate fa-fw me-2 text-secondary" />
                    Reinstall
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
                      Move to node
                    </Dropdown.Item>
                    <Dropdown.Item
                      as="button"
                      disabled={busy}
                      onClick={onShowTransfer}
                    >
                      <i className="fa-solid fa-user-tag fa-fw me-2 text-secondary" />
                      Transfer owner
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
