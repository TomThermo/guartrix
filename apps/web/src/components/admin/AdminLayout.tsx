import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Badge } from "react-bootstrap";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";

type AdminNavItem = {
  to: string;
  labelKey:
    | "nav.status"
    | "nav.goLive"
    | "nav.serverManagement"
    | "nav.settings"
    | "nav.adminSecurity"
    | "nav.nodes"
    | "nav.license"
    | "nav.activity"
    | "nav.panelBilling"
    | "nav.apiKeys"
    | "nav.users";
  icon: string;
  end?: boolean;
  licenseAlert?: boolean;
};

type AdminNavSection = {
  id: "overview" | "fleet" | "config" | "commerce";
  labelKey:
    | "nav.adminSectionOverview"
    | "nav.adminSectionFleet"
    | "nav.adminSectionConfig"
    | "nav.adminSectionCommerce";
  items: AdminNavItem[];
};

/** Grouped admin sidebar — Overview → Fleet → Config → Commerce */
const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: "overview",
    labelKey: "nav.adminSectionOverview",
    items: [
      { to: "/admin/status", labelKey: "nav.status", icon: "fa-heart-pulse", end: true },
      { to: "/admin/settings?tab=golive", labelKey: "nav.goLive", icon: "fa-rocket" },
      { to: "/admin/activity", labelKey: "nav.activity", icon: "fa-list-check" },
    ],
  },
  {
    id: "fleet",
    labelKey: "nav.adminSectionFleet",
    items: [
      { to: "/admin/servers", labelKey: "nav.serverManagement", icon: "fa-server" },
      { to: "/admin/nodes", labelKey: "nav.nodes", icon: "fa-network-wired" },
      { to: "/admin/users", labelKey: "nav.users", icon: "fa-users-gear" },
    ],
  },
  {
    id: "config",
    labelKey: "nav.adminSectionConfig",
    items: [
      { to: "/admin/settings", labelKey: "nav.settings", icon: "fa-sliders" },
      { to: "/admin/security", labelKey: "nav.adminSecurity", icon: "fa-shield-halved" },
      { to: "/admin/api-keys", labelKey: "nav.apiKeys", icon: "fa-key" },
    ],
  },
  {
    id: "commerce",
    labelKey: "nav.adminSectionCommerce",
    items: [
      { to: "/admin/billing", labelKey: "nav.panelBilling", icon: "fa-file-invoice-dollar" },
      { to: "/admin/license", labelKey: "nav.license", icon: "fa-certificate", licenseAlert: true },
    ],
  },
];

function adminNavItemActive(
  pathname: string,
  search: string,
  itemTo: string,
  end?: boolean,
): boolean {
  const [path, query = ""] = itemTo.split("?");
  if (end) return pathname === path;
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  if (!query) {
    // Plain /admin/settings is active only when not on a dedicated overview deep-link tab.
    if (path === "/admin/settings") {
      const tab = new URLSearchParams(search).get("tab");
      return tab !== "golive";
    }
    return true;
  }
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(search);
  for (const [k, v] of want.entries()) {
    if (have.get(k) !== v) return false;
  }
  return true;
}

export function AdminLayout() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [licenseOk, setLicenseOk] = useState(true);
  const [counts, setCounts] = useState<{
    servers: number;
    nodes: number;
    users: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refreshLicense = () => {
      void api
        .getAdminLicenseStatus()
        .then((s) => {
          if (!cancelled) setLicenseOk(s.valid);
        })
        .catch(() => {
          /* ignore */
        });
    };
    refreshLicense();
    window.addEventListener("guartrix:license-changed", refreshLicense);
    return () => {
      cancelled = true;
      window.removeEventListener("guartrix:license-changed", refreshLicense);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api
        .getAdminNavCounts()
        .then((c) => {
          if (!cancelled) setCounts(c);
        })
        .catch(() => {
          /* ignore */
        });
    };
    load();
    window.addEventListener("guartrix:admin-nav-counts", load);
    return () => {
      cancelled = true;
      window.removeEventListener("guartrix:admin-nav-counts", load);
    };
  }, []);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  const countFor = (to: string): number | null => {
    if (!counts) return null;
    if (to === "/admin/servers") return counts.servers;
    if (to === "/admin/nodes" || to === "/admin/system") return counts.nodes;
    if (to === "/admin/users") return counts.users;
    return null;
  };

  return (
    <div className="admin-shell">
      <aside className="admin-shell__sidebar" aria-label={t("nav.admin")}>
        <div className="admin-shell__sidebar-head">
          <div className="fw-semibold">{t("nav.admin")}</div>
          <div className="small text-secondary">{t("nav.panel")}</div>
        </div>
        <nav className="admin-shell__nav d-flex flex-column gap-1">
          {ADMIN_NAV_SECTIONS.map((section) => (
            <div key={section.id} className="admin-shell__section">
              <div className="admin-shell__section-label" id={`admin-nav-${section.id}`}>
                {t(section.labelKey)}
              </div>
              <div
                className="admin-shell__section-items d-flex flex-column gap-1"
                role="group"
                aria-labelledby={`admin-nav-${section.id}`}
              >
                {section.items.map((item) => {
                  const count = countFor(item.to);
                  const active = adminNavItemActive(
                    location.pathname,
                    location.search,
                    item.to,
                    item.end,
                  );
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={() => `admin-shell__link${active ? " active" : ""}`}
                    >
                      <i className={`fa-solid ${item.icon} fa-fw`} aria-hidden />
                      <span className="admin-shell__link-label">{t(item.labelKey)}</span>
                      {item.licenseAlert && !licenseOk ? (
                        <Badge bg="danger" className="ms-auto">
                          {t("nav.attention")}
                        </Badge>
                      ) : count !== null ? (
                        <span className="admin-shell__count ms-auto" title={String(count)}>
                          {count}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="admin-shell__sidebar-foot">
          <Link to="/" className="btn btn-sm btn-outline-secondary w-100">
            <i className="fa-solid fa-arrow-left me-1" aria-hidden />
            {t("nav.dashboard")}
          </Link>
        </div>
      </aside>
      <div className="admin-shell__main">
        <Outlet />
      </div>
    </div>
  );
}
