import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "react-bootstrap";
import type { AuthUser } from "@guartrix/shared";
import { ErrorBoundary } from "./ErrorBoundary";
import { PageFallback } from "./AppShell";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
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
const TermsPage = lazy(() => import("./pages/TermsPage").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);
const WikiHomePage = lazy(() =>
  import("./pages/WikiHomePage").then((m) => ({ default: m.WikiHomePage })),
);
const WikiArticlePage = lazy(() =>
  import("./pages/WikiArticlePage").then((m) => ({ default: m.WikiArticlePage })),
);
const ApiDocsHomePage = lazy(() =>
  import("./pages/ApiDocsHomePage").then((m) => ({ default: m.ApiDocsHomePage })),
);
const ApiDocsPage = lazy(() =>
  import("./pages/ApiDocsPage").then((m) => ({ default: m.ApiDocsPage })),
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
const UsersPage = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })));
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
const AdminApiKeysPage = lazy(() =>
  import("./pages/AdminApiKeysPage").then((m) => ({
    default: m.AdminApiKeysPage,
  })),
);
const NodesPage = lazy(() =>
  import("./pages/NodesPage").then((m) => ({
    default: m.NodesPage,
  })),
);
const AdminStoragePage = lazy(() =>
  import("./pages/AdminStoragePage").then((m) => ({
    default: m.AdminStoragePage,
  })),
);
const AdminSettingsPage = lazy(() =>
  import("./pages/AdminSettingsPage").then((m) => ({
    default: m.AdminSettingsPage,
  })),
);
const AdminSecurityPage = lazy(() =>
  import("./pages/AdminSecurityPage").then((m) => ({
    default: m.AdminSecurityPage,
  })),
);
const AdminLicensePage = lazy(() =>
  import("./pages/AdminLicensePage").then((m) => ({
    default: m.AdminLicensePage,
  })),
);
const AdminServersPage = lazy(() =>
  import("./pages/AdminServersPage").then((m) => ({
    default: m.AdminServersPage,
  })),
);
const AdminLayout = lazy(() =>
  import("./components/admin/AdminLayout").then((m) => ({
    default: m.AdminLayout,
  })),
);
const StatusLinePage = lazy(() =>
  import("./pages/StatusLinePage").then((m) => ({ default: m.StatusLinePage })),
);

export function isPublicPath(pathname: string): boolean {
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
    pathname === "/api-docs" ||
    pathname.startsWith("/api-docs/") ||
    pathname.startsWith("/invite/")
  );
}

export function PublicRoutes() {
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
          <Route path="/api-docs" element={<ApiDocsHomePage />} />
          <Route path="/api-docs/:slug" element={<ApiDocsPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export function AuthenticatedRoutes({ user }: { user: AuthUser | null }) {
  return (
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
          <Route path="/api-docs" element={<ApiDocsHomePage />} />
          <Route path="/api-docs/:slug" element={<ApiDocsPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route
            path="/servers/new"
            element={user?.role === "VIEWER" ? <Navigate to="/" replace /> : <CreateServerPage />}
          />
          <Route path="/servers/:id/console" element={<ServerConsolePage />} />
          <Route path="/servers/:id" element={<ServerDetailPage />} />
          <Route path="/account/security" element={<AccountSecurityPage />} />
          <Route path="/account/billing" element={<AccountBillingPage />} />
          <Route path="/users" element={<Navigate to="/admin/users" replace />} />
          <Route path="/statusline" element={<Navigate to="/admin/status" replace />} />
          <Route
            path="/admin"
            element={user?.role === "ADMIN" ? <AdminLayout /> : <Navigate to="/" replace />}
          >
            <Route index element={<Navigate to="status" replace />} />
            <Route path="status" element={<StatusLinePage />} />
            <Route path="servers" element={<AdminServersPage />} />
            <Route path="server-backups" element={<Navigate to="/admin/servers" replace />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="security" element={<AdminSecurityPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="storage" element={<AdminStoragePage />} />
            <Route path="system" element={<Navigate to="/admin/nodes" replace />} />
            <Route path="license" element={<AdminLicensePage />} />
            <Route path="activity" element={<AdminActivityPage />} />
            <Route path="billing" element={<AdminBillingPage />} />
            <Route path="api-keys" element={<AdminApiKeysPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export function AuthLoadingScreen() {
  return (
    <div className="d-flex justify-content-center align-items-center min-vh-100">
      <Spinner animation="border" role="status" />
    </div>
  );
}
