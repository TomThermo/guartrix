import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AuthUser, UserRole } from "@msm/shared";
import { roleLabel } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  ListGroup,
  Modal,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { ActivityPanel } from "../components/ActivityPanel";
import { QuotasModal } from "../components/QuotasModal";
import { RamGbSelect } from "../components/RamGbSelect";

const ROLES: UserRole[] = ["ADMIN", "OPERATOR", "VIEWER"];

function roleBadge(role: UserRole): "primary" | "success" | "secondary" {
  if (role === "ADMIN") return "primary";
  if (role === "OPERATOR") return "success";
  return "secondary";
}

function roleHint(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Unlimited servers & RAM. Manages users and ownership.";
    case "OPERATOR":
      return "Can create and manage their own servers within quotas.";
    case "VIEWER":
      return "Read-only access to servers assigned to them.";
  }
}

function quotaText(u: AuthUser): string {
  if (u.role === "ADMIN") return "Unlimited";
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
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [hostMemoryGb, setHostMemoryGb] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quotaUser, setQuotaUser] = useState<AuthUser | null>(null);
  const [activityUser, setActivityUser] = useState<AuthUser | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("OPERATOR");
  const [maxServers, setMaxServers] = useState(1);
  const [maxMemoryGb, setMaxMemoryGb] = useState(4);
  const [maxDatabases, setMaxDatabases] = useState(3);
  const [unlimitedServers, setUnlimitedServers] = useState(false);
  const [unlimitedRam, setUnlimitedRam] = useState(false);
  const [unlimitedDatabases, setUnlimitedDatabases] = useState(false);

  const refresh = useCallback(async () => {
    const [list, system] = await Promise.all([api.listUsers(), api.getSystem()]);
    setUsers(list);
    setHostMemoryGb(system.totalMemoryGb);
    setMaxMemoryGb((prev) => Math.min(prev, system.totalMemoryGb) || Math.min(4, system.totalMemoryGb));
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, [refresh]);

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
      setUsername("");
      setPassword("");
      setRole("OPERATOR");
      setMaxServers(1);
      setMaxMemoryGb(Math.min(4, hostMemoryGb));
      setMaxDatabases(3);
      setUnlimitedServers(false);
      setUnlimitedRam(false);
      setUnlimitedDatabases(false);
      setNotice("User created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
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
      setNotice(`Updated ${user.username} to ${roleLabel(next)}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onDelete(user: AuthUser) {
    if (
      !confirm(
        `Delete user "${user.username}"? Their servers will be transferred to you.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.deleteUser(user.id);
      setNotice(`Deleted ${user.username}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onResetTwoFactor(user: AuthUser) {
    if (
      !confirm(
        `Reset two-factor authentication for "${user.username}"? They can sign in with only their password until they re-enable it.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, { disableTwoFactor: true });
      setNotice(`Reset 2FA for ${user.username}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">
            <i className="fa-solid fa-users-gear me-2 text-primary" />
            Users
          </h1>
          <p className="text-secondary mb-0">
            Set per-user server count and total RAM (up to {hostMemoryGb} GB on this host).
            Admins are always unlimited.
          </p>
        </div>
        <Link to="/" className="btn btn-sm btn-outline-secondary">
          Back
        </Link>
      </div>

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

      <Row className="g-4">
        <Col lg={5}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <h2 className="h6 mb-3">Create user</h2>
              <Form onSubmit={(e) => void onCreate(e)}>
                <Form.Group className="mb-3" controlId="new-username">
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[a-zA-Z0-9_\-]+"
                    placeholder="steve"
                  />
                </Form.Group>
                <Form.Group className="mb-3" controlId="new-password">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                  />
                  <Form.Text className="text-secondary">
                    Min. 12 chars with upper, lower, number, and symbol.
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3" controlId="new-role">
                  <Form.Label>Role</Form.Label>
                  <Form.Select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-secondary">{roleHint(role)}</Form.Text>
                </Form.Group>

                {role !== "ADMIN" && (
                  <>
                    <Form.Group className="mb-3" controlId="new-max-servers">
                      <Form.Label>Max servers</Form.Label>
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
                        label="Unlimited servers"
                        checked={unlimitedServers}
                        onChange={(e) => setUnlimitedServers(e.target.checked)}
                      />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="new-max-ram">
                      <Form.Label>Max total RAM</Form.Label>
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
                        label="Unlimited RAM"
                        checked={unlimitedRam}
                        onChange={(e) => setUnlimitedRam(e.target.checked)}
                      />
                      <Form.Text className="text-secondary">
                        Shared across all of this user&apos;s servers (1–{hostMemoryGb} GB).
                      </Form.Text>
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="new-max-databases">
                      <Form.Label>Max databases</Form.Label>
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
                        label="Unlimited databases"
                        checked={unlimitedDatabases}
                        onChange={(e) => setUnlimitedDatabases(e.target.checked)}
                      />
                      <Form.Text className="text-secondary">
                        Shared across all of this user&apos;s servers (default 3).
                      </Form.Text>
                    </Form.Group>
                  </>
                )}

                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Creating…" : "Create user"}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <h2 className="h6 mb-3">Accounts ({users.length})</h2>
              <ListGroup>
                {users.map((u) => (
                  <ListGroup.Item
                    key={u.id}
                    className="d-flex justify-content-between align-items-start gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="fw-semibold">
                        {u.username}
                        {me?.id === u.id && (
                          <span className="text-secondary small ms-2">(you)</span>
                        )}
                      </div>
                      <div className="small text-secondary">{quotaText(u)}</div>
                      {u.twoFactorEnabled && (
                        <div className="small text-success">
                          <i className="fa-solid fa-shield-halved me-1" />
                          2FA on
                        </div>
                      )}
                    </div>
                    <Stack direction="horizontal" gap={2} className="flex-wrap">
                      <Badge bg={roleBadge(u.role)}>{roleLabel(u.role)}</Badge>
                      <Form.Select
                        size="sm"
                        style={{ width: "8rem" }}
                        value={u.role}
                        disabled={me?.id === u.id}
                        onChange={(e) => void onChangeRole(u, e.target.value as UserRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </Form.Select>
                      {u.role !== "ADMIN" && (
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={() => setQuotaUser(u)}
                        >
                          Quotas
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => setActivityUser(u)}
                      >
                        Activity
                      </Button>
                      {u.twoFactorEnabled && (
                        <Button
                          size="sm"
                          variant="outline-warning"
                          onClick={() => void onResetTwoFactor(u)}
                        >
                          Reset 2FA
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={me?.id === u.id}
                        onClick={() => void onDelete(u)}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {quotaUser && (
        <QuotasModal
          user={quotaUser}
          hostMemoryGb={hostMemoryGb}
          onCancel={() => setQuotaUser(null)}
          onSaved={async () => {
            setNotice(`Updated quotas for ${quotaUser.username}.`);
            setQuotaUser(null);
            await refresh();
          }}
        />
      )}

      {activityUser && (
        <Modal
          show
          onHide={() => setActivityUser(null)}
          size="xl"
          scrollable
        >
          <Modal.Header closeButton>
            <Modal.Title>Activity — {activityUser.username}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <ActivityPanel
              userId={activityUser.id}
              showServer
              onError={setError}
            />
          </Modal.Body>
        </Modal>
      )}
    </>
  );
}
