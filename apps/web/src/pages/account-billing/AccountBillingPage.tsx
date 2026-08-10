import { Link, Navigate } from "react-router-dom";
import { Alert } from "react-bootstrap";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { BillingPlansGrid } from "./BillingPlansGrid";
import { BillingPaymentsTable, BillingSubscriptionsTable } from "./BillingTables";
import { useAccountBilling } from "./useAccountBilling";

export function AccountBillingPage() {
  const s = useAccountBilling();

  if (!s.authenticated) return <Navigate to="/login" replace />;

  return (
    <AdminPageShell
      title={s.t("admin.accountBillingTitle")}
      subtitle={
        s.user && s.user.role !== "ADMIN"
          ? `${s.t("admin.accountBillingSubtitle")} Current: ${s.user.maxServers ?? "∞"} servers · ${s.user.maxMemoryMb ?? "∞"} MB RAM · ${s.user.maxDatabases ?? "∞"} DBs`
          : s.t("admin.accountBillingSubtitle")
      }
      icon="fa-file-invoice-dollar"
      error={s.error}
      notice={s.notice}
      onDismissError={() => s.setError(null)}
      onDismissNotice={() => s.setNotice(null)}
      loading={s.loading}
      loadingLabel={s.t("common.loading")}
      extraHeader={
        <Link to="/account/security" className="btn btn-sm btn-outline-secondary">
          {s.t("nav.account")}
        </Link>
      }
    >
      {!s.mollie.configured && (
        <Alert variant="warning">
          Online checkout is not available yet (Mollie not configured). Contact an admin to raise
          your quotas manually.
        </Alert>
      )}
      {s.mollie.configured && s.mollie.testMode && (
        <Alert variant="info">{s.t("admin.mollieTestModeAlert")}</Alert>
      )}

      {s.user?.role === "ADMIN" ? (
        <Alert variant="secondary">
          Admins have unlimited quotas. Manage plans under{" "}
          <Link to="/admin/billing">Admin → Billing</Link>.
        </Alert>
      ) : (
        <BillingPlansGrid
          plans={s.plans}
          busy={s.busy}
          mollieConfigured={s.mollie.configured}
          onCheckout={(plan) => void s.checkout(plan)}
        />
      )}

      <BillingSubscriptionsTable
        subscriptions={s.activeSubs}
        busy={s.busy}
        onCancel={(sub) => void s.cancelSub(sub)}
      />

      <BillingPaymentsTable payments={s.payments} />
    </AdminPageShell>
  );
}
