import type { AuthUser, UserRole } from "@guartrix/shared";
import { roleLabel } from "@guartrix/shared";
import { useState } from "react";
import { Badge, Button, Dropdown, Form, ListGroup } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import { copyText } from "../../utils";
import { quotaText, roleBadge, USER_ROLES } from "./useUsersPage";

type Props = {
  users: AuthUser[];
  filtered: AuthUser[];
  meId: string | undefined;
  filter: string;
  onFilterChange: (value: string) => void;
  onChangeRole: (user: AuthUser, next: UserRole) => void;
  onQuotas: (user: AuthUser) => void;
  onActivity: (user: AuthUser) => void;
  onResetTwoFactor: (user: AuthUser) => void;
  onDelete: (user: AuthUser) => void;
};

export function UsersTable({
  users,
  filtered,
  meId,
  filter,
  onFilterChange,
  onChangeRole,
  onQuotas,
  onActivity,
  onResetTwoFactor,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyOwnerId(id: string) {
    await copyText(id);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <AdminPanelCard title={t("users.accounts", { count: users.length })} icon="fa-users">
      <Form.Control
        className="mb-3"
        type="search"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={t("users.searchPlaceholder")}
        aria-label={t("users.searchPlaceholder")}
      />
      <ListGroup>
        {filtered.map((u) => (
          <ListGroup.Item
            key={u.id}
            className="d-flex justify-content-between align-items-start gap-3 flex-wrap"
          >
            <div className="min-w-0">
              <div className="fw-semibold">
                {u.username}
                {meId === u.id && (
                  <span className="text-secondary small ms-2">({t("users.you")})</span>
                )}
              </div>
              <div className="small text-secondary d-flex align-items-center gap-2 flex-wrap mt-1">
                <span className="text-body-secondary">{t("users.ownerId")}:</span>
                <code className="users-owner-id">{u.id}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline-secondary"
                  className="py-0 px-2"
                  onClick={() => void copyOwnerId(u.id)}
                  aria-label={t("users.copyOwnerId")}
                >
                  {copiedId === u.id ? (
                    <>
                      <i className="fa-solid fa-check me-1" aria-hidden />
                      {t("common.done")}
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-copy me-1" aria-hidden />
                      {t("common.copy")}
                    </>
                  )}
                </Button>
              </div>
              <div className="small text-secondary">{quotaText(u, t("common.unlimited"))}</div>
              {u.twoFactorEnabled && (
                <div className="small text-success">
                  <i className="fa-solid fa-shield-halved me-1" />
                  {t("users.twoFactorOn")}
                </div>
              )}
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Badge bg={roleBadge(u.role)}>{roleLabel(u.role)}</Badge>
              <Form.Select
                size="sm"
                style={{ width: "8rem" }}
                value={u.role}
                disabled={meId === u.id}
                onChange={(e) => void onChangeRole(u, e.target.value as UserRole)}
                aria-label={t("users.role")}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </Form.Select>
              <Dropdown align="end">
                <Dropdown.Toggle
                  size="sm"
                  variant="outline-secondary"
                  id={`user-actions-${u.id}`}
                  className="users-row-menu-toggle"
                >
                  <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
                  <span className="visually-hidden">{t("users.actions")}</span>
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {u.role !== "ADMIN" && (
                    <Dropdown.Item as="button" onClick={() => onQuotas(u)}>
                      <i className="fa-solid fa-gauge-high me-2 text-secondary" aria-hidden />
                      {t("users.quotas")}
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item as="button" onClick={() => onActivity(u)}>
                    <i className="fa-solid fa-clock-rotate-left me-2 text-secondary" aria-hidden />
                    {t("users.activity")}
                  </Dropdown.Item>
                  {u.twoFactorEnabled && (
                    <Dropdown.Item as="button" onClick={() => void onResetTwoFactor(u)}>
                      <i className="fa-solid fa-shield-halved me-2 text-secondary" aria-hidden />
                      {t("users.reset2fa")}
                    </Dropdown.Item>
                  )}
                  <Dropdown.Divider />
                  <Dropdown.Item
                    as="button"
                    className="text-danger"
                    disabled={meId === u.id}
                    onClick={() => void onDelete(u)}
                  >
                    <i className="fa-solid fa-trash me-2" aria-hidden />
                    {t("users.delete")}
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </ListGroup.Item>
        ))}
      </ListGroup>
    </AdminPanelCard>
  );
}
