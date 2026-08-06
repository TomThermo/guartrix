import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { canCreateServer, roleLabel } from "@msm/shared";
import {
  Alert,
  Badge,
  Container,
  Dropdown,
  Navbar,
  Spinner,
} from "react-bootstrap";
import { api } from "./api";
import { useAuth } from "./auth";
import { useI18n } from "./i18n/react";

export function PageFallback() {
  return (
    <div className="d-flex justify-content-center align-items-center py-5">
      <Spinner animation="border" role="status" />
    </div>
  );
}

export function isConsolePopoutPath(pathname: string): boolean {
  return /^\/servers\/[^/]+\/console$/.test(pathname);
}

export function ConsolePopoutShell({ children }: { children: ReactNode }) {
  return <div className="console-popout-shell">{children}</div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const showCreate = canCreateServer(user);
  const needsTwoFactor =
    Boolean(user?.twoFactorRequired) && !user?.twoFactorEnabled;
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);
  const [licenseOk, setLicenseOk] = useState(true);
  const [licenseMsg, setLicenseMsg] = useState("");
  const [licenseBannerDismissed, setLicenseBannerDismissed] = useState(() => {
    try {
      const until = Number(
        localStorage.getItem("guartrix.licenseBannerDismissedUntil") || "0",
      );
      return Number.isFinite(until) && until > Date.now();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const tick = () => {
      void api
        .getAdminLicenseStatus()
        .then((s) => {
          if (cancelled) return;
          setLicenseOk(s.valid);
          setLicenseMsg(s.message || s.status);
          // New valid license clears any dismiss; invalid stays dismissed until expiry.
          if (s.valid) {
            try {
              localStorage.removeItem("guartrix.licenseBannerDismissedUntil");
            } catch {
              /* ignore */
            }
            setLicenseBannerDismissed(false);
          }
        })
        .catch(() => {
          /* ignore transient errors — avoid false admin banners */
        });
    };
    tick();
    // Match panel validate interval (~10m). Faster while invalid or on License page
    // (status endpoint is cached — real force refresh happens on Admin → License).
    const onLicensePage = location.pathname.startsWith("/admin/license");
    const intervalMs = !licenseOk
      ? 30_000
      : onLicensePage
        ? 60_000
        : 10 * 60_000;
    const id = window.setInterval(tick, intervalMs);
    const onLicenseChanged = () => tick();
    window.addEventListener("guartrix:license-changed", onLicenseChanged);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("guartrix:license-changed", onLicenseChanged);
    };
  }, [isAdmin, licenseOk, location.pathname]);

  function dismissLicenseBanner() {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(
        "guartrix.licenseBannerDismissedUntil",
        String(until),
      );
    } catch {
      /* ignore */
    }
    setLicenseBannerDismissed(true);
  }

  return (
    <div className="app-shell">
      <Navbar
        expand="md"
        expanded={navOpen}
        onToggle={setNavOpen}
        className="app-navbar border-bottom sticky-top"
      >
        <Container>
          <Navbar.Brand
            as={Link}
            to="/"
            className="d-flex align-items-center gap-2 text-body min-w-0"
            onClick={closeNav}
          >
            <span className="brand-mark">
              <i className="fa-solid fa-server" />
            </span>
            <span className="min-w-0">
              <strong>Guartrix</strong>
              <small className="d-none d-sm-block text-secondary brand-tagline">
                {t("nav.brandTagline")}
              </small>
            </span>
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="app-nav" className="border-0 ms-auto" />
          <Navbar.Collapse id="app-nav">
            <div className="app-nav-actions ms-md-auto mt-3 mt-md-0">
              {showCreate && (
                <Link
                  to="/servers/new"
                  className="btn btn-sm btn-primary app-nav-cta"
                  onClick={closeNav}
                >
                  <i className="fa-solid fa-plus me-1" />
                  {t("nav.newServer")}
                </Link>
              )}

              <Link
                to="/wiki"
                className="btn btn-sm btn-outline-secondary"
                onClick={closeNav}
              >
                <i className="fa-solid fa-book-open me-1" />
                Wiki
              </Link>

              <Link
                to="/api-docs"
                className="btn btn-sm btn-outline-secondary"
                onClick={closeNav}
              >
                <i className="fa-solid fa-code me-1" />
                API
              </Link>

              {isAdmin && (
                <Dropdown align="end" className="app-nav-dropdown">
                  <Dropdown.Toggle
                    variant={licenseOk ? "outline-secondary" : "outline-danger"}
                    size="sm"
                    id="app-nav-admin"
                    className="app-nav-dropdown-toggle"
                  >
                    <i className="fa-solid fa-user-shield me-1" />
                    {t("nav.admin")}
                    {!licenseOk && (
                      <span
                        className="app-nav-alert-dot"
                        title={t("nav.licenseIssue")}
                      />
                    )}
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="app-nav-dropdown-menu">
                    <Dropdown.Header>{t("nav.panel")}</Dropdown.Header>
                    <Dropdown.Item
                      as={Link}
                      to="/statusline"
                      onClick={closeNav}
                    >
                      <i className="fa-solid fa-heart-pulse fa-fw me-2 text-secondary" />
                      {t("nav.status")}
                    </Dropdown.Item>
                    <Dropdown.Item
                      as={Link}
                      to="/admin/settings"
                      onClick={closeNav}
                    >
                      <i className="fa-solid fa-sliders fa-fw me-2 text-secondary" />
                      {t("nav.settings")}
                    </Dropdown.Item>
                    <Dropdown.Item
                      as={Link}
                      to="/admin/system"
                      onClick={closeNav}
                    >
                      <i className="fa-solid fa-server fa-fw me-2 text-secondary" />
                      {t("nav.nodes")}
                    </Dropdown.Item>
                    <Dropdown.Item
                      as={Link}
                      to="/admin/license"
                      onClick={closeNav}
                      className={!licenseOk ? "text-danger" : undefined}
                    >
                      <i className="fa-solid fa-key fa-fw me-2 text-secondary" />
                      {t("nav.license")}
                      {!licenseOk && (
                        <Badge bg="danger" className="ms-2">
                          {t("nav.attention")}
                        </Badge>
                      )}
                    </Dropdown.Item>
                    <Dropdown.Item
                      as={Link}
                      to="/admin/activity"
                      onClick={closeNav}
                    >
                      <i className="fa-solid fa-list-check fa-fw me-2 text-secondary" />
                      {t("nav.activity")}
                    </Dropdown.Item>
                    <Dropdown.Item
                      as={Link}
                      to="/admin/billing"
                      onClick={closeNav}
                    >
                      <i className="fa-solid fa-file-invoice-dollar fa-fw me-2 text-secondary" />
                      {t("nav.panelBilling")}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item as={Link} to="/users" onClick={closeNav}>
                      <i className="fa-solid fa-users-gear fa-fw me-2 text-secondary" />
                      {t("nav.users")}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}

              {user && (
                <Dropdown align="end" className="app-nav-dropdown">
                  <Dropdown.Toggle
                    variant={needsTwoFactor ? "warning" : "outline-secondary"}
                    size="sm"
                    id="app-nav-account"
                    className="app-nav-dropdown-toggle app-nav-account-toggle"
                  >
                    <i className="fa-solid fa-user me-1" />
                    <span className="app-nav-username">{user.username}</span>
                    <Badge
                      bg={needsTwoFactor ? "dark" : "secondary"}
                      className="ms-1 app-nav-role-badge"
                    >
                      {roleLabel(user.role)}
                    </Badge>
                    {needsTwoFactor && (
                      <span
                        className="app-nav-alert-dot"
                        title={t("nav.twoFactorRequired")}
                      />
                    )}
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="app-nav-dropdown-menu">
                    <Dropdown.Header>{t("nav.account")}</Dropdown.Header>
                    <Dropdown.Item
                      as={Link}
                      to="/account/billing"
                      onClick={closeNav}
                    >
                      <i className="fa-solid fa-credit-card fa-fw me-2 text-secondary" />
                      {t("nav.billing")}
                    </Dropdown.Item>
                    <Dropdown.Item
                      as={Link}
                      to="/account/security"
                      onClick={closeNav}
                      className={needsTwoFactor ? "text-warning" : undefined}
                    >
                      <i className="fa-solid fa-shield-halved fa-fw me-2 text-secondary" />
                      {t("nav.security")}
                      {needsTwoFactor && (
                        <Badge bg="warning" text="dark" className="ms-2">
                          2FA
                        </Badge>
                      )}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      as="button"
                      className="text-danger"
                      onClick={() => {
                        closeNav();
                        void logout();
                      }}
                    >
                      <i className="fa-solid fa-right-from-bracket fa-fw me-2" />
                      {t("nav.signOut")}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="app-main">
        {isAdmin && !licenseOk && !licenseBannerDismissed && (
          <Alert
            variant="danger"
            className="mt-3 mb-0"
            dismissible
            onClose={dismissLicenseBanner}
          >
            <strong>License issue.</strong>{" "}
            {licenseMsg || "License is not valid."}
            {licenseMsg && !/[.!?]$/.test(licenseMsg.trim()) ? "." : ""} Free
            tier applies: 1 node, 1 server, 10 GB disk. Servers beyond those caps
            are stopped.{" "}
            <Link to="/admin/license" className="alert-link">
              Manage license
            </Link>
            <div className="small mt-1 opacity-75">
              Dismiss hides this banner for 24 hours on this browser.
            </div>
          </Alert>
        )}
        {needsTwoFactor && location.pathname !== "/account/security" && (
          <Alert variant="warning" className="mt-3 mb-0">
            Your role requires two-factor authentication.{" "}
            <Link to="/account/security" className="alert-link">
              Enable it under Security
            </Link>{" "}
            before you can change anything.
          </Alert>
        )}
        {children}
      </Container>
      <footer className="main-footer">
        <Container className="main-footer-inner">
          <div className="main-footer-copy">
            Copyright © 2026 · Powered by <strong>Guartrix</strong>.
            {" · "}
            <Link to="/wiki">
              <i className="fa-solid fa-book-open me-1" />
              Wiki
            </Link>
            {" · "}
            <Link to="/api-docs">
              <i className="fa-solid fa-code me-1" />
              API
            </Link>
            {" · "}
            <Link to="/terms">{t("nav.terms")}</Link>
            {" · "}
            <Link to="/privacy">{t("nav.privacy")}</Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
