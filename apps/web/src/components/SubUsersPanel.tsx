import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PERMISSION_GROUPS,
  hasPermission,
  type ServerPermission,
  type ServerSubUser,
} from "@msm/shared";
import {
  Alert,
  Button,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  serverId: string;
  /** Current viewer's permissions (`*` = full). */
  myPermissions: string[];
  canManage: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

export function SubUsersPanel({
  serverId,
  myPermissions,
  canManage,
  onError,
  onNotice,
}: Props) {
  const { t } = useI18n();
  const [subusers, setSubusers] = useState<ServerSubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const canCreate = canManage && hasPermission(myPermissions, "user.create");
  const canUpdate = canManage && hasPermission(myPermissions, "user.update");
  const canDelete = canManage && hasPermission(myPermissions, "user.delete");
  const canRead = canManage && hasPermission(myPermissions, "user.read");

  const grantable = useMemo(() => {
    if (myPermissions.includes("*")) {
      return new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));
    }
    return new Set(myPermissions);
  }, [myPermissions]);

  const refresh = useCallback(async () => {
    const data = await api.listSubUsers(serverId);
    setSubusers(data.subusers);
  }, [serverId]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh()
      .catch((err) =>
        onError(err instanceof Error ? err.message : "Failed to load subusers"),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError, canRead]);

  function togglePerm(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectGroup(groupId: string, on: boolean) {
    const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (!grantable.has(p.key)) continue;
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  function startEdit(row: ServerSubUser) {
    setEditingId(row.id);
    setEmail(row.email);
    setSelected(new Set(row.permissions));
  }

  function resetForm() {
    setEditingId(null);
    setEmail("");
    setSelected(new Set());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canCreate && !editingId) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const permissions = [...selected] as ServerPermission[];
      if (editingId) {
        if (!canUpdate) throw new Error("Missing permission");
        await api.updateSubUser(serverId, editingId, { permissions });
        onNotice("Subuser permissions updated.");
      } else {
        const res = await api.createSubUser(serverId, {
          email: email.trim(),
          permissions,
        });
        if (res.inviteUrl) {
          try {
            await navigator.clipboard.writeText(res.inviteUrl);
            onNotice(
              res.accountCreated
                ? "Subuser invited (account created). Invite link copied."
                : "Subuser invited. Invite link copied.",
            );
          } catch {
            onNotice(
              res.accountCreated
                ? `Subuser invited (account created). Link: ${res.inviteUrl}`
                : `Subuser invited. Link: ${res.inviteUrl}`,
            );
          }
        } else if (res.accountCreated) {
          onNotice(
            "Subuser invited. A new account was created — they will receive an email to set their password.",
          );
        } else {
          onNotice(`Subuser invited: ${res.subuser.email}`);
        }
      }
      resetForm();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save subuser");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row: ServerSubUser) {
    if (!canDelete) return;
    if (!window.confirm(`Remove subuser ${row.email}?`)) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.deleteSubUser(serverId, row.id);
      onNotice(`Removed ${row.email}.`);
      if (editingId === row.id) resetForm();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete subuser");
    } finally {
      setBusy(false);
    }
  }

  async function onResendInvite(row: ServerSubUser) {
    if (!canCreate) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const res = await api.resendSubUserInvite(serverId, row.id);
      if (res.inviteUrl) {
        try {
          await navigator.clipboard.writeText(res.inviteUrl);
          onNotice("Invite link copied and emailed.");
        } catch {
          onNotice(`Invite link: ${res.inviteUrl}`);
        }
      } else {
        onNotice("Invite resent.");
      }
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not resend invite");
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) {
    return (
      <Alert variant="warning" className="mb-0">
        You do not have permission to view subusers.
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="text-center text-secondary py-4">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div className="subusers-panel">
      <header className="mb-3">
        <h2 className="h5 mb-1">{t("subusers.title")}</h2>
        <p className="text-secondary small mb-0">
          Manage co-users for this server. Invite by email and assign fine-grained permissions.
        </p>
      </header>

      <Row className="g-3">
        <Col lg={5}>
          <section className="databases-section h-100">
            <h3 className="databases-section-title">Current subusers</h3>
            {subusers.length === 0 ? (
              <p className="text-secondary small mb-0">{t("subusers.empty")}</p>
            ) : (
              <ListGroup variant="flush">
                {subusers.map((s) => (
                  <ListGroup.Item
                    key={s.id}
                    className="px-0 d-flex justify-content-between align-items-start gap-2"
                  >
                    <div className="min-w-0">
                      <div className="fw-semibold text-truncate">{s.email}</div>
                      <div className="small text-secondary">
                        {s.username ? `@${s.username}` : "Pending account"} ·{" "}
                        {s.permissions.length} permissions
                        {s.invitePending ? " · invite pending" : ""}
                      </div>
                    </div>
                    <Stack direction="horizontal" gap={1} className="flex-wrap">
                      {canCreate && (
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          disabled={busy}
                          onClick={() => void onResendInvite(s)}
                          title="Copy / resend invite link"
                        >
                          Invite link
                        </Button>
                      )}
                      {canUpdate && (
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          disabled={busy}
                          onClick={() => startEdit(s)}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          disabled={busy}
                          onClick={() => void onDelete(s)}
                        >
                          Remove
                        </Button>
                      )}
                    </Stack>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </section>
        </Col>

        {(canCreate || (editingId && canUpdate)) && (
          <Col lg={7}>
            <section className="databases-section">
              <h3 className="databases-section-title">
                {editingId ? "Edit subuser" : "Invite subuser"}
              </h3>
              <Form onSubmit={onSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Email address</Form.Label>
                  <Form.Control
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required={!editingId}
                    disabled={Boolean(editingId) || busy}
                    autoComplete="off"
                  />
                  <Form.Text className="text-secondary">
                    Enter the email address for the user you wish to invite to manage this
                    server. If this user does not have an account yet, one will be created
                    automatically.
                  </Form.Text>
                </Form.Group>

                <div className="subusers-perm-groups mb-3">
                  {PERMISSION_GROUPS.map((group) => {
                    const keys = group.permissions
                      .map((p) => p.key)
                      .filter((k) => grantable.has(k));
                    if (keys.length === 0) return null;
                    const allOn = keys.every((k) => selected.has(k));
                    return (
                      <div key={group.id} className="subusers-perm-group mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h4 className="h6 mb-0">{group.label}</h4>
                          <Form.Check
                            type="checkbox"
                            id={`group-${group.id}`}
                            label="Select all"
                            checked={allOn}
                            disabled={busy}
                            onChange={(e) => selectGroup(group.id, e.target.checked)}
                          />
                        </div>
                        <Stack gap={2}>
                          {group.permissions.map((p) => {
                            if (!grantable.has(p.key)) return null;
                            return (
                              <Form.Check
                                key={p.key}
                                type="checkbox"
                                id={`perm-${p.key}`}
                                checked={selected.has(p.key)}
                                disabled={busy}
                                onChange={() => togglePerm(p.key)}
                                label={
                                  <span>
                                    <strong className="d-block">{p.label}</strong>
                                    <span className="small text-secondary">
                                      {p.description}
                                    </span>
                                  </span>
                                }
                              />
                            );
                          })}
                        </Stack>
                      </div>
                    );
                  })}
                </div>

                <Stack direction="horizontal" gap={2}>
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy ? t("common.saving") : editingId ? t("common.save") : t("subusers.invite")}
                  </Button>
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline-secondary"
                      disabled={busy}
                      onClick={resetForm}
                    >
                      {t("common.cancel")}
                    </Button>
                  )}
                </Stack>
              </Form>
            </section>
          </Col>
        )}
      </Row>
    </div>
  );
}
