import type { PlanTemplateRecord } from "@guartrix/shared";
import { Button, Card, Col, Row } from "react-bootstrap";
import { formatMoney } from "../../utils";

export function BillingPlansGrid({
  plans,
  busy,
  mollieConfigured,
  onCheckout,
}: {
  plans: PlanTemplateRecord[];
  busy: boolean;
  mollieConfigured: boolean;
  onCheckout: (plan: PlanTemplateRecord) => void;
}) {
  return (
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
                disabled={busy || !mollieConfigured || plan.priceCents < 1}
                onClick={() => onCheckout(plan)}
              >
                {plan.priceCents < 1 ? "Contact admin" : "Pay with Mollie"}
              </Button>
            </Card.Body>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
