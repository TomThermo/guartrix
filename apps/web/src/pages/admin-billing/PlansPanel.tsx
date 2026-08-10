import type { FormEvent } from "react";
import type { PlanTemplateRecord } from "@guartrix/shared";
import { ALL_SERVER_TYPES } from "@guartrix/shared";
import { Badge, Button, Col, Form, ListGroup, Row, Stack } from "react-bootstrap";
import { AdminInsetCard, AdminPanelCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import { formatMoney } from "../../utils";
import type { PlanFormState } from "./emptyPlan";

export function PlansPanel({
  plans,
  planForm,
  setPlanForm,
  busy,
  onCreatePlan,
  onTogglePlan,
  onDeletePlan,
}: {
  plans: PlanTemplateRecord[];
  planForm: PlanFormState;
  setPlanForm: (form: PlanFormState) => void;
  busy: boolean;
  onCreatePlan: (e: FormEvent) => void;
  onTogglePlan: (plan: PlanTemplateRecord) => void;
  onDeletePlan: (plan: PlanTemplateRecord) => void;
}) {
  const { t } = useI18n();
  return (
    <AdminPanelCard title="Plans" icon="fa-layer-group" className="mt-4">
      <AdminInsetCard className="mb-3">
        <Form onSubmit={onCreatePlan}>
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
                onChange={(e) => setPlanForm({ ...planForm, priceCents: Number(e.target.value) })}
              />
            </Col>
            <Col sm={4}>
              <Form.Label className="small">Servers</Form.Label>
              <Form.Control
                size="sm"
                type="number"
                min={0}
                value={planForm.maxServers}
                onChange={(e) => setPlanForm({ ...planForm, maxServers: Number(e.target.value) })}
              />
            </Col>
            <Col sm={4}>
              <Form.Label className="small">RAM MB</Form.Label>
              <Form.Control
                size="sm"
                type="number"
                min={0}
                value={planForm.maxMemoryMb}
                onChange={(e) => setPlanForm({ ...planForm, maxMemoryMb: Number(e.target.value) })}
              />
            </Col>
            <Col sm={4}>
              <Form.Label className="small">Databases</Form.Label>
              <Form.Control
                size="sm"
                type="number"
                min={0}
                value={planForm.maxDatabases}
                onChange={(e) => setPlanForm({ ...planForm, maxDatabases: Number(e.target.value) })}
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
                {ALL_SERVER_TYPES.map((serverType) => (
                  <option key={serverType} value={serverType}>
                    {serverType}
                  </option>
                ))}
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
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
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
      </AdminInsetCard>

      <ListGroup>
        {plans.map((plan) => (
          <ListGroup.Item
            key={plan.id}
            className="d-flex justify-content-between align-items-start gap-2 flex-wrap"
          >
            <div>
              <div className="fw-semibold">
                {plan.name} <code className="small text-secondary">{plan.slug}</code>
              </div>
              <div className="small text-secondary">
                {formatMoney(plan.priceCents, plan.currency)} · {plan.maxServers} srv ·{" "}
                {plan.maxMemoryMb} MB · {plan.maxDatabases} DB
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
                onClick={() => onTogglePlan(plan)}
              >
                {plan.enabled ? t("common.disable") : t("common.enable")}
              </Button>
              <Button
                size="sm"
                variant="outline-danger"
                disabled={busy}
                onClick={() => onDeletePlan(plan)}
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
    </AdminPanelCard>
  );
}
