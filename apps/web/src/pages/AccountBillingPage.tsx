import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import type { BillingSubscriptionRecord, PaymentRecord, PlanTemplateRecord } from "@msm/shared";
import { Alert, Badge, Button, Card, Col, Row, Table } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { AdminPageShell } from "../components/admin/AdminPageShell";
import { formatMoney } from "../utils";

function statusBadge(status: string) {
  const bg =
    status === "PAID" || status === "active"
      ? "success"
      : status === "OPEN" || status === "PENDING" || status === "pending"
        ? "warning"
        : status === "CANCELED" ||
            status === "EXPIRED" ||
            status === "FAILED" ||
            status === "canceled" ||
            status === "suspended"
          ? "secondary"
          : "secondary";
  return <Badge bg={bg}>{status}</Badge>;
}

export function AccountBillingPage() {
  const { user, refreshUser, authenticated } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState<PlanTemplateRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingSubscriptionRecord[]>([]);
  const [mollie, setMollie] = useState<{ configured: boolean; testMode: boolean }>({
    configured: false,
    testMode: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [planRes, payRes, subRes, status] = await Promise.all([
      api.listBillingPlans(),
      api.listMyPayments(),
      api.listMySubscriptions(),
      api.mollieStatus(),
    ]);
    setPlans(planRes.plans);
    setPayments(payRes.payments);
    setSubscriptions(subRes.subscriptions);
    setMollie(status);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("admin.billingLoadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  useEffect(() => {
    const paymentId = searchParams.get("payment");
    if (!paymentId) return;
    setBusy(true);
    void api
      .syncPayment(paymentId)
      .then(async (res) => {
        if (res.payment.status === "PAID") {
          setNotice(
            res.payment.provisioned
              ? "Payment received — your plan quotas are active."
              : "Payment received.",
          );
          await refreshUser();
        } else {
          setNotice(`Payment status: ${res.payment.status}`);
        }
        await refresh();
        setSearchParams({}, { replace: true });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not sync payment"))
      .finally(() => setBusy(false));
  }, [searchParams, setSearchParams, refresh, refreshUser]);

  if (!authenticated) return <Navigate to="/login" replace />;

  async function checkout(plan: PlanTemplateRecord) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.createCheckout({ planSlug: plan.slug });
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(false);
    }
  }

  async function cancelSub(sub: BillingSubscriptionRecord) {
    if (
      !window.confirm(
        `Cancel subscription for ${sub.planName ?? "plan"}? You keep access until the current period; failed renewals revoke quotas.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.cancelSubscription(sub.id);
      setNotice("Subscription canceled — no further renewals.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  const activeSubs = subscriptions.filter((s) => s.status === "active" || s.status === "pending");

  return (
    <AdminPageShell
      title={t("admin.accountBillingTitle")}
      subtitle={
        user && user.role !== "ADMIN"
          ? `${t("admin.accountBillingSubtitle")} Current: ${user.maxServers ?? "∞"} servers · ${user.maxMemoryMb ?? "∞"} MB RAM · ${user.maxDatabases ?? "∞"} DBs`
          : t("admin.accountBillingSubtitle")
      }
      icon="fa-file-invoice-dollar"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={loading}
      loadingLabel={t("common.loading")}
      extraHeader={
        <Link to="/account/security" className="btn btn-sm btn-outline-secondary">
          {t("nav.account")}
        </Link>
      }
    >
      {!mollie.configured && (
        <Alert variant="warning">
          Online checkout is not available yet (Mollie not configured). Contact an admin to raise
          your quotas manually.
        </Alert>
      )}
      {mollie.configured && mollie.testMode && (
        <Alert variant="info">{t("admin.mollieTestModeAlert")}</Alert>
      )}

      {user?.role === "ADMIN" ? (
        <Alert variant="secondary">
          Admins have unlimited quotas. Manage plans under{" "}
          <Link to="/admin/billing">Admin → Billing</Link>.
        </Alert>
      ) : (
        <Row className="g-3 mb-4">
          {plans.length === 0 && (
            <Col>
              <p className="text-secondary">No plans published yet.</p>
            </Col>
          )}
          {plans.map((plan) => (
            <Col md={6} lg={4} key={plan.id}>
              <Card className="h-100 surface">
                <Card.Body>
                  <Card.Title className="h5">{plan.name}</Card.Title>
                  <div className="display-6 fs-3 mb-2">
                    {formatMoney(plan.priceCents, plan.currency)}
                  </div>
                  {plan.description && <p className="small text-secondary">{plan.description}</p>}
                  <ul className="small mb-3">
                    <li>{plan.maxServers} server(s)</li>
                    <li>{plan.maxMemoryMb} MB RAM pool</li>
                    <li>{plan.maxDatabases} database(s)</li>
                    {plan.recurringInterval && <li>Recurring: {plan.recurringInterval}</li>}
                    {plan.autoCreateServer && (
                      <li>
                        Includes a {plan.defaultMemoryMb} MB {plan.defaultServerType} server
                      </li>
                    )}
                  </ul>
                  <Button
                    variant="primary"
                    disabled={busy || !mollie.configured || plan.priceCents < 1}
                    onClick={() => void checkout(plan)}
                  >
                    {plan.priceCents < 1 ? "Contact admin" : "Pay with Mollie"}
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {activeSubs.length > 0 && (
        <>
          <h2 className="h5 mb-3">Subscriptions</h2>
          <div className="table-responsive border rounded surface mb-4">
            <Table hover className="mb-0 align-middle">
              <thead>
                <tr className="text-secondary">
                  <th>Plan</th>
                  <th>Interval</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activeSubs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.planName ?? s.planSlug ?? "—"}</td>
                    <td className="small">{s.interval}</td>
                    <td>{formatMoney(s.amountCents, s.currency)}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td className="text-end">
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={busy}
                        onClick={() => void cancelSub(s)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}

      <h2 className="h5 mb-3">Payment history</h2>
      <div className="table-responsive border rounded surface">
        <Table hover className="mb-0 align-middle">
          <thead>
            <tr className="text-secondary">
              <th>When</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="text-secondary">
                  No payments yet.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="small">{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.planName ?? p.planSlug ?? "—"}</td>
                <td>{formatMoney(p.amountCents, p.currency)}</td>
                <td>
                  {statusBadge(p.status)}
                  {p.provisioned && (
                    <Badge bg="success" className="ms-1">
                      Applied
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AdminPageShell>
  );
}
