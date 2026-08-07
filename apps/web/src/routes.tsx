import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "react-bootstrap";
import type { AuthUser } from "@msm/shared";
import { ErrorBoundary } from "./ErrorBoundary";
import { PageFallback } from "./AppShell";

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
const AdminServerBackupsPage = lazy(() =>
  import("./pages/AdminServerBackupsPage").then((m) => ({
    default: m.AdminServerBackupsPage,
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
            path="/admin/server-backups"
            element={
              user?.role === "ADMIN" ? (
                <AdminServerBackupsPage />
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
  );
}

export function AuthLoadingScreen() {
  return (
    <div className="d-flex justify-content-center align-items-center min-vh-100">
      <Spinner animation="border" role="status" />
    </div>
  );
}
