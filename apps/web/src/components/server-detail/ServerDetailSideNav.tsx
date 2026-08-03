import { Link } from "react-router-dom";
import { Nav } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import type { MenuGroupId, TabId } from "./server-tabs";

export type ServerDetailMenuSection = {
  id: MenuGroupId;
  label: string;
  items: Array<{
    id: TabId;
    icon: string;
    label: string;
    group: MenuGroupId;
    adminOnly?: boolean;
    anyOf?: string[];
  }>;
};

export function ServerDetailSideNav({
  activeTab,
  menuSections,
  onChangeTab,
  onPick,
  whitelistOn,
  isRunning,
  addonUpdateCount,
  isOwner,
  busy,
  onDelete,
}: {
  activeTab: TabId;
  menuSections: ServerDetailMenuSection[];
  onChangeTab: (tab: TabId) => void;
  onPick?: () => void;
  whitelistOn: boolean;
  isRunning: boolean;
  addonUpdateCount: number;
  isOwner: boolean;
  busy: boolean;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <Nav
      className="flex-column server-side-nav-list"
      activeKey={activeTab}
      onSelect={(k) => {
        if (!k) return;
        onChangeTab(k as TabId);
        onPick?.();
      }}
    >
      <div className="server-side-nav-section">
        <div className="server-side-nav-header">{t("common.general")}</div>
        <Link
          to="/"
          className="server-side-nav-link"
          onClick={() => onPick?.()}
        >
          <i className="fa-solid fa-server" aria-hidden />
          <span>{t("serverDetail.serverList")}</span>
        </Link>
      </div>
      {menuSections.map((section) => (
        <div key={section.id} className="server-side-nav-section">
          <div className="server-side-nav-header">{section.label}</div>
          {section.items.map((tabItem) => (
            <Nav.Link
              key={tabItem.id}
              eventKey={tabItem.id}
              active={activeTab === tabItem.id}
              className={`server-side-nav-link${
                tabItem.id === "whitelist" ||
                tabItem.id === "console" ||
                (tabItem.id === "addons" && addonUpdateCount > 0)
                  ? " has-status-badge"
                  : ""
              }`}
            >
              {tabItem.id === "whitelist" && (
                <span
                  className={`server-nav-status-badge ${whitelistOn ? "is-on" : "is-off"}`}
                  title={
                    whitelistOn
                      ? t("serverDetail.whitelistEnabled")
                      : t("serverDetail.whitelistDisabled")
                  }
                  aria-hidden
                >
                  <i className={`fa-solid ${whitelistOn ? "fa-check" : "fa-xmark"}`} />
                </span>
              )}
              {tabItem.id === "console" && (
                <span
                  className={`server-nav-power-icon ${isRunning ? "is-on" : "is-off"}`}
                  title={
                    isRunning
                      ? t("serverDetail.serverRunning")
                      : t("serverDetail.serverStopped")
                  }
                  aria-hidden
                >
                  <i className={`fa-solid ${isRunning ? "fa-play" : "fa-stop"}`} />
                </span>
              )}
              {tabItem.id === "addons" && addonUpdateCount > 0 && (
                <span
                  className="server-nav-count-badge"
                  title={
                    addonUpdateCount === 1
                      ? t("serverDetail.updatesAvailable", { count: addonUpdateCount })
                      : t("serverDetail.updatesAvailablePlural", { count: addonUpdateCount })
                  }
                >
                  {addonUpdateCount > 99 ? "99+" : addonUpdateCount}
                </span>
              )}
              <i className={`fa-solid ${tabItem.icon}`} aria-hidden />
              <span>{tabItem.label}</span>
            </Nav.Link>
          ))}
        </div>
      ))}
      {isOwner && (
        <div className="server-side-nav-section">
          <div className="server-side-nav-header">{t("common.dangerZone")}</div>
          <button
            type="button"
            className="server-side-nav-link server-side-nav-danger"
            disabled={busy}
            onClick={() => {
              onPick?.();
              onDelete();
            }}
          >
            <i className="fa-solid fa-trash" aria-hidden />
            <span>{t("serverDetail.deleteServer")}</span>
          </button>
        </div>
      )}
    </Nav>
  );
}
