import { lazy, Suspense, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { canCreateServer, roleLabel } from "@msm/shared";
import { Alert, Badge, Button, Container, Navbar, Spinner } from "react-bootstrap";
import { api } from "./api";
import { useAuth } from "./auth";

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

function Shell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const showCreate = canCreateServer(user);
  const needsTwoFactor =
    Boolean(user?.twoFactorRequired) && !user?.twoFactorEnabled;
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);
  const [licenseOk, setLicenseOk] = useState(true);
  const [licenseMsg, setLicenseMsg] = useState("");

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
                Minecraft Server Manager
              </small>
            </span>
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="app-nav" className="border-0 ms-auto" />
          <Navbar.Collapse id="app-nav">
            <div className="app-nav-actions d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 ms-md-auto mt-3 mt-md-0">
              {user && (
                <span className="small text-secondary d-flex align-items-center gap-2 px-1">
                  <i className="fa-solid fa-user d-md-none" aria-hidden />
                  {user.username}
                  <Badge bg="secondary">{roleLabel(user.role)}</Badge>
                </span>
              )}
              {isAdmin && (
                <>
                  <Link
                    to="/statusline"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={closeNav}
                  >
                    <i className="fa-solid fa-heart-pulse me-1" />
                    Status
                  </Link>
                  <Link
                    to="/admin/system"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={closeNav}
                  >
                    <i className="fa-solid fa-server me-1" />
                    System
                  </Link>
                  <Link
                    to="/admin/license"
                    className={`btn btn-sm ${licenseOk ? "btn-outline-secondary" : "btn-outline-danger"}`}
                    onClick={closeNav}
                  >
                    <i className="fa-solid fa-key me-1" />
                    License
                  </Link>
                  <Link
                    to="/admin/activity"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={closeNav}
                  >
                    <i className="fa-solid fa-list-check me-1" />
                    Activity
                  </Link>
                  <Link
                    to="/admin/billing"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={closeNav}
                  >
                    <i className="fa-solid fa-credit-card me-1" />
                    Billing
                  </Link>
                  <Link
                    to="/users"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={closeNav}
                  >
                    <i className="fa-solid fa-users-gear me-1" />
                    Users
                  </Link>
                </>
              )}
              {showCreate && (
                <Link to="/servers/new" className="btn btn-sm btn-primary" onClick={closeNav}>
                  <i className="fa-solid fa-plus me-1" />
                  New server
                </Link>
              )}
              <Link
                to="/account/billing"
                className="btn btn-sm btn-outline-secondary"
                onClick={closeNav}
              >
                <i className="fa-solid fa-credit-card me-1" />
                Billing
              </Link>
              <Link
                to="/account/security"
                className={`btn btn-sm ${needsTwoFactor ? "btn-warning" : "btn-outline-secondary"}`}
                onClick={closeNav}
              >
                <i className="fa-solid fa-shield-halved me-1" />
                Security
              </Link>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => {
                  closeNav();
                  void logout();
                }}
              >
                <i className="fa-solid fa-right-from-bracket me-1" />
                Sign out
              </Button>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="app-main">
        {isAdmin && !licenseOk && (
          <Alert variant="danger" className="mt-3 mb-0">
            <strong>License issue.</strong> {licenseMsg || "License is not valid."}{" "}
            Free tier applies: 1 node, 1 server, 10 GB disk. Servers beyond those
            caps are stopped.{" "}
            <Link to="/admin/license" className="alert-link">
              Manage license
            </Link>
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
            <Link to="/terms">Terms</Link>
            {" · "}
            <Link to="/privacy">Privacy</Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}

function PublicRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
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
    pathname.startsWith("/invite/")
  );
}

export function App() {
  const { loading, authenticated, user } = useAuth();
  const location = useLocation();

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

  return (
    <Shell>
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
    </Shell>
  );
}
