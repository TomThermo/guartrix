import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AuthUser, UserRole } from "@msm/shared";
import { roleLabel } from "@msm/shared";
import { Badge, Button, Col, Dropdown, Form, ListGroup, Modal, Row } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { ActivityPanel } from "../components/ActivityPanel";
import { QuotasModal } from "../components/QuotasModal";
import { RamGbSelect } from "../components/RamGbSelect";

const ROLES: UserRole[] = ["ADMIN", "OPERATOR", "VIEWER"];

function roleBadge(role: UserRole): "primary" | "success" | "secondary" {
  if (role === "ADMIN") return "primary";
  if (role === "OPERATOR") return "success";
  return "secondary";
}

function roleHintKey(role: UserRole): "users.roleHintAdmin" | "users.roleHintOperator" | "users.roleHintViewer" {
  switch (role) {
    case "ADMIN":
      return "users.roleHintAdmin";
    case "OPERATOR":
      return "users.roleHintOperator";
    case "VIEWER":
      return "users.roleHintViewer";
  }
}

function quotaText(u: AuthUser, unlimitedLabel: string): string {
  if (u.role === "ADMIN") return unlimitedLabel;
  const servers =
    u.maxServers == null
      ? `${u.serverCount ?? 0} servers (no limit)`
      : `${u.serverCount ?? 0}/${u.maxServers} servers`;
  const usedGb = ((u.memoryUsedMb ?? 0) / 1024).toFixed(
    u.memoryUsedMb && u.memoryUsedMb % 1024 === 0 ? 0 : 1,
  );
  const ram =
    u.maxMemoryMb == null
      ? `${usedGb} GB RAM used (no limit)`
      : `${usedGb}/${(u.maxMemoryMb / 1024).toFixed(u.maxMemoryMb % 1024 === 0 ? 0 : 1)} GB RAM`;
  const dbs =
    u.maxDatabases == null
      ? `${u.databaseCount ?? 0} DBs (no limit)`
      : `${u.databaseCount ?? 0}/${u.maxDatabases} DBs`;
  return `${servers} · ${ram} · ${dbs}`;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [hostMemoryGb, setHostMemoryGb] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quotaUser, setQuotaUser] = useState<AuthUser | null>(null);
  const [activityUser, setActivityUser] = useState<AuthUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("OPERATOR");
  const [maxServers, setMaxServers] = useState(1);
  const [maxMemoryGb, setMaxMemoryGb] = useState(4);
  const [maxDatabases, setMaxDatabases] = useState(3);
  const [unlimitedServers, setUnlimitedServers] = useState(false);
  const [unlimitedRam, setUnlimitedRam] = useState(false);
  const [unlimitedDatabases, setUnlimitedDatabases] = useState(false);
  const [filter, setFilter] = useState("");

  const refresh = useCallback(async () => {
    const [list, system] = await Promise.all([api.listUsers(), api.getSystem()]);
    setUsers(list);
    setHostMemoryGb(system.totalMemoryGb);
    setMaxMemoryGb(
      (prev) => Math.min(prev, system.totalMemoryGb) || Math.min(4, system.totalMemoryGb),
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("users.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  function resetCreateForm() {
    setUsername("");
    setPassword("");
    setRole("OPERATOR");
    setMaxServers(1);
    setMaxMemoryGb(Math.min(4, hostMemoryGb));
    setMaxDatabases(3);
    setUnlimitedServers(false);
    setUnlimitedRam(false);
    setUnlimitedDatabases(false);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.createUser({
        username: username.trim(),
        password,
        role,
        maxServers: role === "ADMIN" || unlimitedServers ? null : maxServers,
        maxMemoryMb: role === "ADMIN" || unlimitedRam ? null : maxMemoryGb * 1024,
        maxDatabases: role === "ADMIN" || unlimitedDatabases ? null : maxDatabases,
      });
      resetCreateForm();
      setShowCreate(false);
      setNotice(t("users.createdNotice"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRole(user: AuthUser, next: UserRole) {
    if (user.role === next) return;
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, { role: next });
      setNotice(t("users.roleUpdated", { username: user.username, role: roleLabel(next) }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.updateFailed"));
    }
  }

  async function onDelete(user: AuthUser) {
    if (!confirm(t("users.deleteConfirm", { username: user.username }))) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.deleteUser(user.id);
      setNotice(t("users.deletedNotice", { username: user.username }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.deleteFailed"));
    }
  }

  async function onResetTwoFactor(user: AuthUser) {
    if (!confirm(t("users.reset2faConfirm", { username: user.username }))) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, { disableTwoFactor: true });
      setNotice(t("users.reset2faNotice", { username: user.username }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.reset2faFailed"));
    }
  }

  if (loading) {
    return (
      <AdminPageShell
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        icon="fa-users-gear"
        loading
        loadingLabel={t("common.loading")}
      />
    );
  }

  const filtered = users.filter((u) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      roleLabel(u.role).toLowerCase().includes(q)
    );
  });

  return (
    <AdminPageShell
      title={t("users.title")}
      subtitle={t("users.subtitle")}
      icon="fa-users-gear"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      backTo="/"
      backLabel={t("common.back")}
      extraHeader={
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <i className="fa-solid fa-user-plus me-1" aria-hidden />
          {t("users.createUser")}
        </Button>
      }
    >
      <Row className="g-4">
        <Col xs={12}>
          <AdminPanelCard title={t("users.accounts", { count: users.length })} icon="fa-users">
            <Form.Control
              className="mb-3"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
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
                      {me?.id === u.id && (
                        <span className="text-secondary small ms-2">({t("users.you")})</span>
                      )}
                    </div>
                    <div className="small text-secondary">
                      {quotaText(u, t("common.unlimited"))}
                    </div>
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
                      disabled={me?.id === u.id}
                      onChange={(e) => void onChangeRole(u, e.target.value as UserRole)}
                      aria-label={t("users.role")}
                    >
                      {ROLES.map((r) => (
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
                          <Dropdown.Item as="button" onClick={() => setQuotaUser(u)}>
                            <i className="fa-solid fa-gauge-high me-2 text-secondary" aria-hidden />
                            {t("users.quotas")}
                          </Dropdown.Item>
                        )}
                        <Dropdown.Item as="button" onClick={() => setActivityUser(u)}>
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
                          disabled={me?.id === u.id}
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
        </Col>
      </Row>

      <Modal
        show={showCreate}
        onHide={() => {
          if (!busy) setShowCreate(false);
        }}
        centered
      >
        <Form onSubmit={(e) => void onCreate(e)}>
          <Modal.Header closeButton>
            <Modal.Title>{t("users.createUser")}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" controlId="new-username">
              <Form.Label>{t("users.username")}</Form.Label>
              <Form.Control
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_\-]+"
                placeholder="steve"
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="new-password">
              <Form.Label>{t("users.password")}</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
              />
              <Form.Text className="text-secondary">{t("users.passwordHelp")}</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="new-role">
              <Form.Label>{t("users.role")}</Form.Label>
              <Form.Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-secondary">{t(roleHintKey(role))}</Form.Text>
            </Form.Group>

            {role !== "ADMIN" && (
              <>
                <Form.Group className="mb-3" controlId="new-max-servers">
                  <Form.Label>{t("users.maxServers")}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    value={maxServers}
                    disabled={unlimitedServers}
                    onChange={(e) => setMaxServers(Number(e.target.value))}
                  />
                  <Form.Check
                    className="mt-2"
                    type="checkbox"
                    id="unlimited-servers"
                    label={t("users.unlimitedServers")}
                    checked={unlimitedServers}
                    onChange={(e) => setUnlimitedServers(e.target.checked)}
                  />
                </Form.Group>
                <Form.Group className="mb-3" controlId="new-max-ram">
                  <Form.Label>{t("users.maxRam")}</Form.Label>
                  <RamGbSelect
                    id="new-max-ram"
                    valueGb={maxMemoryGb}
                    maxGb={hostMemoryGb}
                    disabled={unlimitedRam}
                    onChangeGb={setMaxMemoryGb}
                  />
                  <Form.Check
                    className="mt-2"
                    type="checkbox"
                    id="unlimited-ram"
                    label={t("users.unlimitedRam")}
                    checked={unlimitedRam}
                    onChange={(e) => setUnlimitedRam(e.target.checked)}
                  />
                  <Form.Text className="text-secondary">
                    {t("users.ramPoolHelp", { gb: hostMemoryGb })}
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-0" controlId="new-max-databases">
                  <Form.Label>{t("users.maxDatabases")}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    value={maxDatabases}
                    disabled={unlimitedDatabases}
                    onChange={(e) => setMaxDatabases(Number(e.target.value))}
                  />
                  <Form.Check
                    className="mt-2"
                    type="checkbox"
                    id="unlimited-databases"
                    label={t("users.unlimitedDatabases")}
                    checked={unlimitedDatabases}
                    onChange={(e) => setUnlimitedDatabases(e.target.checked)}
                  />
                  <Form.Text className="text-secondary">{t("users.databasesHelp")}</Form.Text>
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="outline-secondary"
              disabled={busy}
              onClick={() => setShowCreate(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("users.creating") : t("users.createUser")}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {quotaUser && (
        <QuotasModal
          user={quotaUser}
          hostMemoryGb={hostMemoryGb}
          onCancel={() => setQuotaUser(null)}
          onSaved={async () => {
            setNotice(t("users.quotasUpdated", { username: quotaUser.username }));
            setQuotaUser(null);
            await refresh();
          }}
        />
      )}

      {activityUser && (
        <Modal show onHide={() => setActivityUser(null)} size="xl" scrollable>
          <Modal.Header closeButton>
            <Modal.Title>
              {t("users.activityTitle", { username: activityUser.username })}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <ActivityPanel userId={activityUser.id} showServer onError={setError} />
          </Modal.Body>
        </Modal>
      )}
    </AdminPageShell>
  );
}
