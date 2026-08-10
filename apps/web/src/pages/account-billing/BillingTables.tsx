import type { BillingSubscriptionRecord, PaymentRecord } from "@guartrix/shared";
import { Badge, Button, Table } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatMoney } from "../../utils";
import { billingStatusBadge } from "./billingStatusBadge";

export function BillingSubscriptionsTable({
  subscriptions,
  busy,
  onCancel,
}: {
  subscriptions: BillingSubscriptionRecord[];
  busy: boolean;
  onCancel: (sub: BillingSubscriptionRecord) => void;
}) {
  const { t } = useI18n();
  if (subscriptions.length === 0) return null;

  return (
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
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td>{s.planName ?? s.planSlug ?? "—"}</td>
                <td className="small">{s.interval}</td>
                <td>{formatMoney(s.amountCents, s.currency)}</td>
                <td>{billingStatusBadge(s.status)}</td>
                <td className="text-end">
                  <Button
                    size="sm"
                    variant="outline-danger"
                    disabled={busy}
                    onClick={() => onCancel(s)}
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
  );
}

export function BillingPaymentsTable({ payments }: { payments: PaymentRecord[] }) {
  return (
    <>
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
                  {billingStatusBadge(p.status)}
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
    </>
  );
}
