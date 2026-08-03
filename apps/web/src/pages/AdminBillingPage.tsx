import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type {
  ApplicationApiKeyRecord,
  PaymentRecord,
  PlanTemplateRecord,
} from "@msm/shared";
import { APPLICATION_SCOPES } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Stack,
  Table,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { formatMoney } from "../utils";

const emptyPlan = {
  slug: "starter",
  name: "Starter",
  description: "",
  priceCents: 999,
  currency: "EUR",
  maxServers: 1,
  maxMemoryMb: 4096,
  maxDatabases: 3,
  defaultMemoryMb: 4096,
  defaultDiskMb: 10240,
  autoCreateServer: false,
  defaultServerType: "PAPER",
  defaultMcVersion: "1.21.1",
  recurringInterval: "" as string,
  enabled: true,
  sortOrder: 0,
};

export function AdminBillingPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [plans, setPlans] = useState<PlanTemplateRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [keys, setKeys] = useState<ApplicationApiKeyRecord[]>([]);
  const [maxKeys, setMaxKeys] = useState(20);
  const [mollie, setMollie] = useState({ configured: false, testMode: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["*"]);
  const [newToken, setNewToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [p, pay, k, status] = await Promise.all([
      api.adminListPlans(),
      api.adminListPayments(),
      api.listApplicationKeys(),
      api.mollieStatus(),
    ]);
    setPlans(p.plans);
    setPayments(pay.payments);
    setKeys(k.keys);
    setMaxKeys(k.maxKeys);
    setMollie(status);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [refresh]);

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

  async function onCreateKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNewToken(null);
    try {
      const result = await api.createApplicationKey({
        name: keyName.trim(),
        scopes: keyScopes,
      });
      setNewToken(result.token);
      setKeyName("");
      setNotice("Application API key created — copy the token now.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create key failed");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(key: ApplicationApiKeyRecord) {
    if (!confirm(`Revoke Application key "${key.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeApplicationKey(key.id);
      setNotice("Key revoked.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="h3 mb-1">{t("admin.billingTitle")}</h1>
      <p className="text-secondary mb-3">{t("admin.billingSubtitle")}</p>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {newToken && (
        <Alert variant="warning">
          <strong>Copy this Application API token now:</strong>
          <code className="d-block mt-2 user-select-all text-break">{newToken}</code>
        </Alert>
      )}

      {loading ? (
        <div className="text-secondary py-4">
          <Spinner size="sm" className="me-2" />
          {t("common.loading")}…
        </div>
      ) : (
        <Row className="g-4">
          <Col lg={6}>
            <h2 className="h5 mb-2">Mollie</h2>
            <p className="small text-secondary">
              {mollie.configured
                ? `Configured${mollie.testMode ? " (test mode)" : " (live)"}. Webhook: /api/public/billing/mollie`
                : "Set MOLLIE_API_KEY in .env (test_… or live_…) and restart the panel."}
            </p>

            <h2 className="h5 mb-3 mt-4">Plans</h2>
            <Form onSubmit={(e) => void onCreatePlan(e)} className="border rounded p-3 mb-3 bg-body-tertiary">
              <Row className="g-2">
                <Col sm={6}>
                  <Form.Label className="small">Slug</Form.Label>
                  <Form.Control
                    size="sm"
                    value={planForm.slug}
                    onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })}
                    required
                  />
                </Col>
                <Col sm={6}>
                  <Form.Label className="small">{t("common.name")}</Form.Label>
                  <Form.Control
                    size="sm"
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    required
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Price (cents)</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={0}
                    value={planForm.priceCents}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, priceCents: Number(e.target.value) })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Servers</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={0}
                    value={planForm.maxServers}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, maxServers: Number(e.target.value) })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">RAM MB</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={0}
                    value={planForm.maxMemoryMb}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, maxMemoryMb: Number(e.target.value) })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Databases</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={0}
                    value={planForm.maxDatabases}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, maxDatabases: Number(e.target.value) })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Default RAM MB</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={512}
                    value={planForm.defaultMemoryMb}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        defaultMemoryMb: Number(e.target.value),
                      })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Default disk MB</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={1024}
                    value={planForm.defaultDiskMb}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        defaultDiskMb: Number(e.target.value),
                      })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Default type</Form.Label>
                  <Form.Select
                    size="sm"
                    value={planForm.defaultServerType}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        defaultServerType: e.target.value,
                      })
                    }
                  >
                    {["PAPER", "VANILLA", "PURPUR", "FABRIC", "FORGE", "NEOFORGE", "QUILT"].map(
                      (t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ),
                    )}
                  </Form.Select>
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Default MC version</Form.Label>
                  <Form.Control
                    size="sm"
                    value={planForm.defaultMcVersion}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        defaultMcVersion: e.target.value,
                      })
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Form.Label className="small">Recurring (Mollie)</Form.Label>
                  <Form.Select
                    size="sm"
                    value={planForm.recurringInterval}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        recurringInterval: e.target.value,
                      })
                    }
                  >
                    <option value="">One-off</option>
                    <option value="1 month">Monthly</option>
                    <option value="3 months">Every 3 months</option>
                    <option value="1 year">Yearly</option>
                  </Form.Select>
                </Col>
                <Col sm={8}>
                  <Form.Label className="small">Description</Form.Label>
                  <Form.Control
                    size="sm"
                    value={planForm.description}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, description: e.target.value })
                    }
                  />
                </Col>
                <Col sm={12}>
                  <Form.Check
                    type="checkbox"
                    id="auto-create-server"
                    label="Auto-create server after payment (uses defaults above)"
                    checked={planForm.autoCreateServer}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        autoCreateServer: e.target.checked,
                      })
                    }
                  />
                </Col>
              </Row>
              <Button type="submit" size="sm" className="mt-3" disabled={busy}>
                {t("common.create")} plan
              </Button>
            </Form>

            <ListGroup>
              {plans.map((plan) => (
                <ListGroup.Item
                  key={plan.id}
                  className="d-flex justify-content-between align-items-start gap-2 flex-wrap"
                >
                  <div>
                    <div className="fw-semibold">
                      {plan.name}{" "}
                      <code className="small text-secondary">{plan.slug}</code>
                    </div>
                    <div className="small text-secondary">
                      {formatMoney(plan.priceCents, plan.currency)} · {plan.maxServers}{" "}
                      srv · {plan.maxMemoryMb} MB · {plan.maxDatabases} DB
                      {plan.recurringInterval ? ` · ${plan.recurringInterval}` : ""}
                      {plan.autoCreateServer ? " · auto-server" : ""}
                    </div>
                    <Badge bg={plan.enabled ? "success" : "secondary"} className="mt-1">
                      {plan.enabled ? t("common.enabled") : t("common.disabled")}
                    </Badge>
                  </div>
                  <Stack direction="horizontal" gap={2}>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={busy}
                      onClick={() => void togglePlan(plan)}
                    >
                      {plan.enabled ? t("common.disable") : t("common.enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={busy}
                      onClick={() => void deletePlan(plan)}
                    >
                      {t("common.delete")}
                    </Button>
                  </Stack>
                </ListGroup.Item>
              ))}
              {plans.length === 0 && (
                <ListGroup.Item className="text-secondary">No plans yet</ListGroup.Item>
              )}
            </ListGroup>
          </Col>

          <Col lg={6}>
            <h2 className="h5 mb-3">Application API keys</h2>
            <Form onSubmit={(e) => void onCreateKey(e)} className="border rounded p-3 mb-3 bg-body-tertiary">
              <Form.Group className="mb-2">
                <Form.Label className="small">{t("common.name")}</Form.Label>
                <Form.Control
                  size="sm"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  required
                  maxLength={64}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label className="small">Scopes</Form.Label>
                <Form.Select
                  size="sm"
                  value={keyScopes.includes("*") ? "*" : "custom"}
                  onChange={(e) => {
                    if (e.target.value === "*") setKeyScopes(["*"]);
                    else setKeyScopes([...APPLICATION_SCOPES]);
                  }}
                >
                  <option value="*">Full access (*)</option>
                  <option value="custom">All named scopes</option>
                </Form.Select>
              </Form.Group>
              <Button
                type="submit"
                size="sm"
                disabled={busy || !keyName.trim() || keys.filter((k) => !k.revokedAt).length >= maxKeys}
              >
                {t("common.create")} key
              </Button>
            </Form>
            <ListGroup className="mb-4">
              {keys.map((key) => (
                <ListGroup.Item
                  key={key.id}
                  className="d-flex justify-content-between align-items-start gap-2"
                >
                  <div>
                    <div className="fw-semibold">{key.name}</div>
                    <code className="small">{key.prefix}…</code>
                    <div className="small text-secondary">
                      {key.scopes.join(", ")}
                      {key.revokedAt ? " · revoked" : ""}
                    </div>
                  </div>
                  {!key.revokedAt && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={busy}
                      onClick={() => void revokeKey(key)}
                    >
                      Revoke
                    </Button>
                  )}
                </ListGroup.Item>
              ))}
              {keys.length === 0 && (
                <ListGroup.Item className="text-secondary">No keys yet</ListGroup.Item>
              )}
            </ListGroup>

            <h2 className="h5 mb-3">Recent payments</h2>
            <div className="table-responsive border rounded surface">
              <Table hover size="sm" className="mb-0 align-middle">
                <thead>
                  <tr className="text-secondary">
                    <th>User</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-secondary">
                        No payments yet
                      </td>
                    </tr>
                  )}
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.username ?? p.userId}</td>
                      <td>{p.planSlug ?? "—"}</td>
                      <td>{formatMoney(p.amountCents, p.currency)}</td>
                      <td>
                        <Badge bg={p.status === "PAID" ? "success" : "secondary"}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Col>
        </Row>
      )}
    </div>
  );
}
