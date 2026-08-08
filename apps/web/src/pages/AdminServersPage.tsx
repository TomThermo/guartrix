import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { AdminServerRow, AuthUser } from "@msm/shared";
import { BACKUP_KEEP_COUNT_PRESETS, roleLabel } from "@msm/shared";
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Table } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AdminInsetCard, AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { MemorySelect } from "../components/MemorySelect";
import { useI18n } from "../i18n/react";

type CpuOption =
  | { value: number; labelKey: "createServer.unlimited" }
  | { value: number; label: string };

const CPU_OPTIONS: CpuOption[] = [
  { value: 0, labelKey: "createServer.unlimited" },
  { value: 50, label: "0.5 core (50%)" },
  { value: 100, label: "1 core (100%)" },
  { value: 200, label: "2 cores (200%)" },
  { value: 400, label: "4 cores (400%)" },
  { value: 800, label: "8 cores (800%)" },
];

type EditDraft = {
  name: string;
  ownerId: string;
  memoryMb: number;
  diskMb: number;
  cpuLimit: number;
  suspended: boolean;
  keepCount: number;
};

function statusVariant(status: string): "success" | "warning" | "secondary" | "danger" {
  if (status === "RUNNING") return "success";
  if (status === "STARTING" || status === "STOPPING") return "warning";
  if (status === "ERROR") return "danger";
  return "secondary";
}

function toDraft(row: AdminServerRow): EditDraft {
  return {
    name: row.name,
    ownerId: row.ownerId ?? "",
    memoryMb: row.memoryMb,
    diskMb: row.diskMb,
    cpuLimit: row.cpuLimit,
    suspended: row.suspended,
    keepCount: row.keepCount,
  };
}

function AdminServerEditModal({
  row,
  users,
  busy,
  onClose,
  onSaved,
}: {
  row: AdminServerRow;
  users: AuthUser[];
  busy: boolean;
  onClose: () => void;
  onSaved: (server: AdminServerRow) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => toDraft(row));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(row));
    setError(null);
  }, [row]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateAdminServer(row.id, {
        name: draft.name.trim(),
        ownerId: draft.ownerId || null,
        memoryMb: draft.memoryMb,
        diskMb: draft.diskMb,
        cpuLimit: draft.cpuLimit,
        suspended: draft.suspended,
        keepCount: draft.keepCount,
      });
      onSaved(res.server);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminServers.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <Modal show onHide={disabled ? undefined : onClose} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!disabled}>
        <Modal.Title>{t("adminServers.editTitle", { name: row.name })}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error ? (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="admin-server-name">
              <Form.Label>{t("adminServers.fieldName")}</Form.Label>
              <Form.Control
                value={draft.name}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="admin-server-owner">
              <Form.Label>{t("adminServers.fieldOwner")}</Form.Label>
              <Form.Select
                value={draft.ownerId}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value }))}
              >
                <option value="">{t("adminServers.noOwner")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({roleLabel(u.role)})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="admin-server-memory">
              <Form.Label>{t("adminServers.fieldMemory")}</Form.Label>
              <MemorySelect
                valueMb={draft.memoryMb}
                disabled={disabled}
                onChangeMb={(memoryMb) => setDraft((d) => ({ ...d, memoryMb }))}
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="admin-server-disk">
              <Form.Label>{t("adminServers.fieldDisk")}</Form.Label>
              <MemorySelect
                valueMb={draft.diskMb}
                disabled={disabled}
                onChangeMb={(diskMb) => setDraft((d) => ({ ...d, diskMb }))}
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="admin-server-cpu">
              <Form.Label>{t("createServer.cpuLimit")}</Form.Label>
              <Form.Select
                value={draft.cpuLimit}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, cpuLimit: Number(e.target.value) }))}
              >
                {CPU_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {"labelKey" in opt ? t(opt.labelKey) : opt.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="admin-server-keep">
              <Form.Label>{t("adminServers.fieldBackups")}</Form.Label>
              <Form.Select
                value={draft.keepCount}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, keepCount: Number(e.target.value) }))}
              >
                {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
                  <option key={n} value={n}>
                    {t("backups.backupsCount", { n })}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6} className="d-flex align-items-end">
            <Form.Check
              type="switch"
              id="admin-server-suspended"
              disabled={disabled}
              label={t("adminServers.fieldSuspended")}
              checked={draft.suspended}
              onChange={(e) => setDraft((d) => ({ ...d, suspended: e.target.checked }))}
            />
          </Col>
        </Row>

        <hr />
        <dl className="row small text-secondary mb-0">
          <dt className="col-sm-3">{t("adminServers.metaNode")}</dt>
          <dd className="col-sm-9">{row.nodeName ?? "—"}</dd>
          <dt className="col-sm-3">{t("adminServers.metaType")}</dt>
          <dd className="col-sm-9">
            {row.type} · {row.mcVersion}
          </dd>
          <dt className="col-sm-3">{t("adminServers.metaPort")}</dt>
          <dd className="col-sm-9">{row.port}</dd>
          <dt className="col-sm-3">{t("adminServers.metaBackups")}</dt>
          <dd className="col-sm-9">
            {row.backupCount} / {row.keepCount}
            {row.scheduleMode !== "off" ? (
              <Badge bg="secondary" className="ms-2">
                {t("adminServers.scheduled")}
              </Badge>
            ) : null}
          </dd>
        </dl>
        <p className="small text-secondary mt-3 mb-0">
          {t("adminServers.deepSettingsHint")}{" "}
          <Link to={`/servers/${row.id}`}>{t("adminServers.openServer")}</Link>
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={disabled} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={disabled} onClick={() => void onSave()}>
          {saving ? (
            <>
              <Spinner size="sm" className="me-2" />
              {t("common.saving")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function AdminServersPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [servers, setServers] = useState<AdminServerRow[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [filter, setFilter] = useState("");
  const [editRow, setEditRow] = useState<AdminServerRow | null>(null);

  const refresh = useCallback(async () => {
    const [data, userList] = await Promise.all([api.listAdminServers(), api.listUsers()]);
    setServers(data.servers);
    setUsers(userList);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("adminServers.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ownerUsername.toLowerCase().includes(q) ||
        (s.nodeName ?? "").toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [filter, servers]);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  function onSaved(server: AdminServerRow) {
    setServers((prev) => prev.map((s) => (s.id === server.id ? server : s)));
    setEditRow(null);
    setNotice(t("adminServers.saved", { name: server.name }));
  }

  return (
    <AdminPageShell
      title={t("adminServers.title")}
      subtitle={t("adminServers.subtitle")}
      icon="fa-server"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={loading}
      loadingLabel={t("common.loading")}
    >
      <AdminPanelCard
        title={t("adminServers.serversTitle", { count: servers.length })}
        icon="fa-table-list"
      >
        <Row className="g-3 mb-3">
          <Col md={8}>
            <Form.Control
              type="search"
              placeholder={t("adminServers.searchPlaceholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </Col>
          <Col md={4} className="text-md-end">
            <Link to="/admin/settings?tab=backup" className="btn btn-outline-secondary btn-sm">
              <i className="fa-solid fa-sliders me-2" aria-hidden />
              {t("adminServers.defaultBackupLink")}
            </Link>
          </Col>
        </Row>

        {filtered.length === 0 ? (
          <Alert variant="light" className="border mb-0">
            {t("adminServers.empty")}
          </Alert>
        ) : (
          <AdminInsetCard className="p-0 overflow-auto">
            <Table hover responsive className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>{t("adminServers.colServer")}</th>
                  <th>{t("adminServers.colOwner")}</th>
                  <th>{t("adminServers.colNode")}</th>
                  <th>{t("adminServers.colStatus")}</th>
                  <th className="text-end">{t("adminServers.colRam")}</th>
                  <th className="text-end">{t("adminServers.colDisk")}</th>
                  <th className="text-end">{t("adminServers.colCpu")}</th>
                  <th>{t("adminServers.colBackups")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const over = row.backupCount > row.keepCount;
                  return (
                    <tr key={row.id} className={row.suspended ? "table-warning" : undefined}>
                      <td>
                        <Link
                          to={`/servers/${row.id}`}
                          className="fw-semibold text-decoration-none"
                        >
                          {row.name}
                        </Link>
                        {row.suspended ? (
                          <Badge bg="warning" text="dark" className="ms-2">
                            {t("adminServers.suspendedBadge")}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="text-secondary">{row.ownerUsername}</td>
                      <td className="text-secondary">{row.nodeName ?? "—"}</td>
                      <td>
                        <Badge bg={statusVariant(row.status)}>{row.status}</Badge>
                      </td>
                      <td className="text-end">{Math.round(row.memoryMb / 1024)} GB</td>
                      <td className="text-end">{Math.round(row.diskMb / 1024)} GB</td>
                      <td className="text-end">
                        {row.cpuLimit === 0 ? t("createServer.unlimited") : `${row.cpuLimit}%`}
                      </td>
                      <td>
                        <span className={over ? "text-warning fw-semibold" : undefined}>
                          {row.backupCount}/{row.keepCount}
                        </span>
                        {over ? (
                          <div className="small text-warning">{t("adminServers.overLimit")}</div>
                        ) : null}
                      </td>
                      <td className="text-end">
                        <Button size="sm" variant="outline-primary" onClick={() => setEditRow(row)}>
                          {t("adminServers.edit")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </AdminInsetCard>
        )}
      </AdminPanelCard>

      {editRow ? (
        <AdminServerEditModal
          row={editRow}
          users={users}
          busy={loading}
          onClose={() => setEditRow(null)}
          onSaved={onSaved}
        />
      ) : null}
    </AdminPageShell>
  );
}
