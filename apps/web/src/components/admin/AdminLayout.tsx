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
    | "nav.serverManagement"
    | "nav.settings"
    | "nav.nodes"
    | "nav.license"
    | "nav.activity"
    | "nav.panelBilling"
    | "nav.users";
  icon: string;
  end?: boolean;
  licenseAlert?: boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin/status", labelKey: "nav.status", icon: "fa-heart-pulse", end: true },
  { to: "/admin/servers", labelKey: "nav.serverManagement", icon: "fa-server" },
  { to: "/admin/settings", labelKey: "nav.settings", icon: "fa-sliders" },
  { to: "/admin/system", labelKey: "nav.nodes", icon: "fa-network-wired" },
  { to: "/admin/license", labelKey: "nav.license", icon: "fa-key", licenseAlert: true },
  { to: "/admin/activity", labelKey: "nav.activity", icon: "fa-list-check" },
  { to: "/admin/billing", labelKey: "nav.panelBilling", icon: "fa-file-invoice-dollar" },
  { to: "/admin/users", labelKey: "nav.users", icon: "fa-users-gear" },
];

export function AdminLayout() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [licenseOk, setLicenseOk] = useState(true);

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
  }, [location.pathname]);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  return (
    <div className="admin-shell">
      <aside className="admin-shell__sidebar" aria-label={t("nav.admin")}>
        <div className="admin-shell__sidebar-head">
          <div className="fw-semibold">{t("nav.admin")}</div>
          <div className="small text-secondary">{t("nav.panel")}</div>
        </div>
        <nav className="admin-shell__nav d-flex flex-column gap-1">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-shell__link${isActive ? " active" : ""}`
              }
            >
              <i className={`fa-solid ${item.icon} fa-fw`} aria-hidden />
              <span className="admin-shell__link-label">{t(item.labelKey)}</span>
              {item.licenseAlert && !licenseOk ? (
                <Badge bg="danger" className="ms-auto">
                  {t("nav.attention")}
                </Badge>
              ) : null}
            </NavLink>
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
