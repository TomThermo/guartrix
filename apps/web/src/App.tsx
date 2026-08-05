import { lazy, Suspense, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
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
import { ErrorBoundary } from "./ErrorBoundary";
import { useI18n } from "./i18n/react";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })),
);
const TermsPage = lazy(() =>
  import("./pages/TermsPage").then((m) => ({ default: m.TermsPage })),
);
const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);
const WikiHomePage = lazy(() =>
  import("./pages/WikiHomePage").then((m) => ({ default: m.WikiHomePage })),
);
const WikiArticlePage = lazy(() =>
  import("./pages/WikiArticlePage").then((m) => ({ default: m.WikiArticlePage })),
);
const InvitePage = lazy(() =>
  import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CreateServerPage = lazy(() =>
  import("./pages/CreateServerPage").then((m) => ({
    default: m.CreateServerPage,
  })),
);
const ServerDetailPage = lazy(() =>
  import("./pages/ServerDetailPage").then((m) => ({
    default: m.ServerDetailPage,
  })),
);
const ServerConsolePage = lazy(() =>
  import("./pages/ServerConsolePage").then((m) => ({
    default: m.ServerConsolePage,
  })),
);
const UsersPage = lazy(() =>
  import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const AdminActivityPage = lazy(() =>
  import("./pages/AdminActivityPage").then((m) => ({
    default: m.AdminActivityPage,
  })),
);
const AccountSecurityPage = lazy(() =>
  import("./pages/AccountSecurityPage").then((m) => ({
    default: m.AccountSecurityPage,
  })),
);
const AccountBillingPage = lazy(() =>
  import("./pages/AccountBillingPage").then((m) => ({
    default: m.AccountBillingPage,
  })),
);
const AdminBillingPage = lazy(() =>
  import("./pages/AdminBillingPage").then((m) => ({
    default: m.AdminBillingPage,
  })),
);
const SystemSettingsPage = lazy(() =>
  import("./pages/SystemSettingsPage").then((m) => ({
    default: m.SystemSettingsPage,
  })),
);
const AdminSettingsPage = lazy(() =>
  import("./pages/AdminSettingsPage").then((m) => ({
    default: m.AdminSettingsPage,
  })),
);
const AdminLicensePage = lazy(() =>
  import("./pages/AdminLicensePage").then((m) => ({
    default: m.AdminLicensePage,
  })),
);
const StatusLinePage = lazy(() =>
  import("./pages/StatusLinePage").then((m) => ({ default: m.StatusLinePage })),
);

function PageFallback() {
  return (
    <div className="d-flex justify-content-center align-items-center py-5">
      <Spinner animation="border" role="status" />
    </div>
  );
}

function isConsolePopoutPath(pathname: string): boolean {
  return /^\/servers\/[^/]+\/console$/.test(pathname);
}

function ConsolePopoutShell({ children }: { children: ReactNode }) {
  return <div className="console-popout-shell">{children}</div>;
}

function Shell({ children }: { children: ReactNode }) {
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
            <Link to="/terms">{t("nav.terms")}</Link>
            {" · "}
            <Link to="/privacy">{t("nav.privacy")}</Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}

function PublicRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/wiki" element={<WikiHomePage />} />
          <Route path="/wiki/:slug" element={<WikiArticlePage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify-email" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/wiki" ||
    pathname.startsWith("/wiki/") ||
    pathname.startsWith("/invite/")
  );
}

export function App() {
  const { loading, authenticated, user } = useAuth();
  const location = useLocation();

  const popoutConsole = isConsolePopoutPath(location.pathname);

  if (!authenticated) {
    // Login/register/legal render immediately — do not wait on /api/auth/me.
    // For "/" and other protected paths, wait for the session check to avoid a login flash.
    if (isPublicPath(location.pathname) || !loading) {
      return <PublicRoutes />;
    }
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <Spinner animation="border" role="status" />
      </div>
    );
  }

  const Layout = popoutConsole ? ConsolePopoutShell : Shell;

  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/wiki" element={<WikiHomePage />} />
            <Route path="/wiki/:slug" element={<WikiArticlePage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route
              path="/servers/new"
              element={
                user?.role === "VIEWER" ? (
                  <Navigate to="/" replace />
                ) : (
                  <CreateServerPage />
                )
              }
            />
            <Route path="/servers/:id/console" element={<ServerConsolePage />} />
            <Route path="/servers/:id" element={<ServerDetailPage />} />
            <Route path="/account/security" element={<AccountSecurityPage />} />
            <Route path="/account/billing" element={<AccountBillingPage />} />
            <Route
              path="/users"
              element={
                user?.role === "ADMIN" ? <UsersPage /> : <Navigate to="/" replace />
              }
            />
            <Route
              path="/admin/billing"
              element={
                user?.role === "ADMIN" ? (
                  <AdminBillingPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/admin/settings"
              element={
                user?.role === "ADMIN" ? (
                  <AdminSettingsPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/admin/system"
              element={
                user?.role === "ADMIN" ? (
                  <SystemSettingsPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/admin/license"
              element={
                user?.role === "ADMIN" ? (
                  <AdminLicensePage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/admin/activity"
              element={
                user?.role === "ADMIN" ? (
                  <AdminActivityPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/statusline"
              element={
                user?.role === "ADMIN" ? (
                  <StatusLinePage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
