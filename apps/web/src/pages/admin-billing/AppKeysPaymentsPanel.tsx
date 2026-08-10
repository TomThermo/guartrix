import type { FormEvent } from "react";
import type { ApplicationApiKeyRecord, PaymentRecord } from "@guartrix/shared";
import { APPLICATION_SCOPES } from "@guartrix/shared";
import { Badge, Button, Form, ListGroup, Table } from "react-bootstrap";
import { AdminInsetCard, AdminPanelCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import { formatMoney } from "../../utils";

export function ApplicationApiKeysCard({
  keys,
  maxKeys,
  keyName,
  setKeyName,
  keyScopes,
  setKeyScopes,
  busy,
  onCreateKey,
  onRevokeKey,
}: {
  keys: ApplicationApiKeyRecord[];
  maxKeys: number;
  keyName: string;
  setKeyName: (value: string) => void;
  keyScopes: string[];
  setKeyScopes: (scopes: string[]) => void;
  busy: boolean;
  onCreateKey: (e: FormEvent) => void;
  onRevokeKey: (key: ApplicationApiKeyRecord) => void;
}) {
  const { t } = useI18n();
  return (
    <AdminPanelCard title={t("admin.appApiKeysTitle")} icon="fa-key">
      <p className="small text-secondary mb-3">{t("admin.appApiKeysHelp")}</p>
      <AdminInsetCard className="mb-3">
        <Form onSubmit={onCreateKey}>
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
            <Form.Label className="small">{t("admin.appApiKeysScopes")}</Form.Label>
            <Form.Select
              size="sm"
              value={keyScopes.includes("*") ? "*" : "custom"}
              onChange={(e) => {
                if (e.target.value === "*") setKeyScopes(["*"]);
                else setKeyScopes([...APPLICATION_SCOPES]);
              }}
            >
              <option value="*">{t("admin.appApiKeysFullAccess")}</option>
              <option value="custom">{t("admin.appApiKeysNamedScopes")}</option>
            </Form.Select>
          </Form.Group>
          <Button
            type="submit"
            size="sm"
            disabled={busy || !keyName.trim() || keys.filter((k) => !k.revokedAt).length >= maxKeys}
          >
            {t("common.create")}
          </Button>
        </Form>
      </AdminInsetCard>
      <ListGroup>
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
                {key.revokedAt ? ` · ${t("admin.appApiKeysRevoked")}` : ""}
              </div>
            </div>
            {!key.revokedAt && (
              <Button
                size="sm"
                variant="outline-danger"
                disabled={busy}
                onClick={() => onRevokeKey(key)}
              >
                {t("admin.appApiKeysRevoke")}
              </Button>
            )}
          </ListGroup.Item>
        ))}
        {keys.length === 0 && (
          <ListGroup.Item className="text-secondary">{t("admin.appApiKeysEmpty")}</ListGroup.Item>
        )}
      </ListGroup>
    </AdminPanelCard>
  );
}

export function RecentPaymentsCard({ payments }: { payments: PaymentRecord[] }) {
  const { t } = useI18n();
  return (
    <AdminPanelCard title={t("admin.recentPaymentsTitle")} icon="fa-clock-rotate-left">
      <div className="table-responsive admin-inset-card p-0 overflow-hidden">
        <Table hover size="sm" className="mb-0 align-middle">
          <thead>
            <tr className="text-secondary">
              <th>{t("common.username")}</th>
              <th>{t("admin.planColumn")}</th>
              <th>{t("admin.amountColumn")}</th>
              <th>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="text-secondary">
                  {t("admin.noPaymentsYet")}
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.username ?? p.userId}</td>
                <td>{p.planSlug ?? "—"}</td>
                <td>{formatMoney(p.amountCents, p.currency)}</td>
                <td>
                  <Badge bg={p.status === "PAID" ? "success" : "secondary"}>{p.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </AdminPanelCard>
  );
}

/** @deprecated Prefer ApplicationApiKeysCard + RecentPaymentsCard */
export function AppKeysPaymentsPanel({
  keys,
  payments,
  maxKeys,
  keyName,
  setKeyName,
  keyScopes,
  setKeyScopes,
  busy,
  onCreateKey,
  onRevokeKey,
}: {
  keys: ApplicationApiKeyRecord[];
  payments: PaymentRecord[];
  maxKeys: number;
  keyName: string;
  setKeyName: (value: string) => void;
  keyScopes: string[];
  setKeyScopes: (scopes: string[]) => void;
  busy: boolean;
  onCreateKey: (e: FormEvent) => void;
  onRevokeKey: (key: ApplicationApiKeyRecord) => void;
}) {
  return (
    <>
      <ApplicationApiKeysCard
        keys={keys}
        maxKeys={maxKeys}
        keyName={keyName}
        setKeyName={setKeyName}
        keyScopes={keyScopes}
        setKeyScopes={setKeyScopes}
        busy={busy}
        onCreateKey={onCreateKey}
        onRevokeKey={onRevokeKey}
      />
      <div className="mt-4">
        <RecentPaymentsCard payments={payments} />
      </div>
    </>
  );
}
