import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BillingSubscriptionRecord, PaymentRecord, PlanTemplateRecord } from "@guartrix/shared";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";

export function useAccountBilling() {
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

  return {
    user,
    authenticated,
    t,
    plans,
    payments,
    activeSubs,
    mollie,
    loading,
    busy,
    error,
    setError,
    notice,
    setNotice,
    checkout,
    cancelSub,
  };
}
