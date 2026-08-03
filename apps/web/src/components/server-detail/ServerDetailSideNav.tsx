import { Link } from "react-router-dom";
import { Nav } from "react-bootstrap";
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
        <div className="server-side-nav-header">General</div>
        <Link
          to="/"
          className="server-side-nav-link"
          onClick={() => onPick?.()}
        >
          <i className="fa-solid fa-server" aria-hidden />
          <span>Server list</span>
        </Link>
      </div>
      {menuSections.map((section) => (
        <div key={section.id} className="server-side-nav-section">
          <div className="server-side-nav-header">{section.label}</div>
          {section.items.map((t) => (
            <Nav.Link
              key={t.id}
              eventKey={t.id}
              active={activeTab === t.id}
              className={`server-side-nav-link${
                t.id === "whitelist" ||
                t.id === "console" ||
                (t.id === "addons" && addonUpdateCount > 0)
                  ? " has-status-badge"
                  : ""
              }`}
            >
              {t.id === "whitelist" && (
                <span
                  className={`server-nav-status-badge ${whitelistOn ? "is-on" : "is-off"}`}
                  title={whitelistOn ? "Whitelist enabled" : "Whitelist disabled"}
                  aria-hidden
                >
                  <i className={`fa-solid ${whitelistOn ? "fa-check" : "fa-xmark"}`} />
                </span>
              )}
              {t.id === "console" && (
                <span
                  className={`server-nav-power-icon ${isRunning ? "is-on" : "is-off"}`}
                  title={isRunning ? "Server running" : "Server stopped"}
                  aria-hidden
                >
                  <i className={`fa-solid ${isRunning ? "fa-play" : "fa-stop"}`} />
                </span>
              )}
              {t.id === "addons" && addonUpdateCount > 0 && (
                <span
                  className="server-nav-count-badge"
                  title={`${addonUpdateCount} update${addonUpdateCount === 1 ? "" : "s"} available`}
                >
                  {addonUpdateCount > 99 ? "99+" : addonUpdateCount}
                </span>
              )}
              <i className={`fa-solid ${t.icon}`} aria-hidden />
              <span>{t.label}</span>
            </Nav.Link>
          ))}
        </div>
      ))}
      {isOwner && (
        <div className="server-side-nav-section">
          <div className="server-side-nav-header">Danger zone</div>
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
            <span>Delete server</span>
          </button>
        </div>
      )}
    </Nav>
  );
}
