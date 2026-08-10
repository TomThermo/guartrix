import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import type { PaymentRecord, PlanTemplateRecord } from "@guartrix/shared";
import { Col, Row } from "react-bootstrap";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import { RecentPaymentsCard } from "./AppKeysPaymentsPanel";
import { emptyPlan } from "./emptyPlan";
import { MolliePanel } from "./MolliePanel";
import { PlansPanel } from "./PlansPanel";

export function AdminBillingPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [plans, setPlans] = useState<PlanTemplateRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [mollie, setMollie] = useState({ configured: false, testMode: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlan);

  const refresh = useCallback(async () => {
    const [p, pay, status] = await Promise.all([
      api.adminListPlans(),
      api.adminListPayments(),
      api.mollieStatus(),
    ]);
    setPlans(p.plans);
    setPayments(pay.payments);
    setMollie(status);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("admin.billingLoadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  async function onCreatePlan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminCreatePlan({
        ...planForm,
        description: planForm.description.trim() || null,
        recurringInterval: planForm.recurringInterval.trim() || null,
      });
      setNotice("Plan created.");
      setPlanForm({ ...emptyPlan, slug: `plan-${Date.now().toString(36)}` });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create plan failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlan(plan: PlanTemplateRecord) {
    setBusy(true);
    setError(null);
    try {
      await api.adminUpdatePlan(plan.id, { enabled: !plan.enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan(plan: PlanTemplateRecord) {
    if (!confirm(`Delete plan "${plan.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDeletePlan(plan.id);
      setNotice("Plan deleted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageShell
      title={t("admin.billingTitle")}
      subtitle={t("admin.billingSubtitle")}
      icon="fa-file-invoice-dollar"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={loading}
      loadingLabel={`${t("common.loading")}…`}
    >
      <p className="small text-secondary mb-3">
        {t("admin.billingApiKeysMoved")}{" "}
        <Link to="/admin/api-keys">{t("nav.apiKeys")}</Link>
      </p>
      <Row className="g-4">
        <Col lg={6}>
          <MolliePanel configured={mollie.configured} testMode={mollie.testMode} />
          <PlansPanel
            plans={plans}
            planForm={planForm}
            setPlanForm={setPlanForm}
            busy={busy}
            onCreatePlan={(e) => void onCreatePlan(e)}
            onTogglePlan={(plan) => void togglePlan(plan)}
            onDeletePlan={(plan) => void deletePlan(plan)}
          />
        </Col>
        <Col lg={6}>
          <RecentPaymentsCard payments={payments} />
        </Col>
      </Row>
    </AdminPageShell>
  );
}
