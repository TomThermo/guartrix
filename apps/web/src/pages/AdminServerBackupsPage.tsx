import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  BACKUP_KEEP_COUNT_PRESETS,
  type AdminServerBackupRow,
} from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AdminInsetCard, AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";

type RowDraft = Record<string, number>;

export function AdminServerBackupsPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [defaultKeepCount, setDefaultKeepCount] = useState(7);
  const [servers, setServers] = useState<AdminServerBackupRow[]>([]);
  const [draft, setDraft] = useState<RowDraft>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const refresh = useCallback(async () => {
    const data = await api.list();
    setDefaultKeepCount(data.defaultKeepCount);
    setServers(data.servers);
    setDraft(
      Object.fromEntries(data.servers.map((s) => [s.id, s.keepCount])),
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("adminServerBackups.loadFailed")),
      )
      .finally(() => setLoading(false));
  }, [refresh, t]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ownerUsername.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [filter, servers]);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  async function onSaveDefault(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.updatePanelSettings({
        defaultBackupKeepCount: defaultKeepCount,
      });
      setDefaultKeepCount(res.defaultBackupKeepCount);
      setNotice(t("adminServerBackups.defaultSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminServerBackups.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveRow(serverId: string) {
    const keepCount = draft[serverId];
    if (keepCount == null) return;
    setSavingId(serverId);
    setError(null);
    setNotice(null);
    try {
      const res = await api.updateKeepCount(serverId, keepCount);
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? res.server : s)),
      );
      setDraft((prev) => ({ ...prev, [serverId]: res.server.keepCount }));
      setNotice(t("adminServerBackups.rowSaved", { name: res.server.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminServerBackups.saveFailed"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminPageShell
      title={t("adminServerBackups.title")}
      subtitle={t("adminServerBackups.subtitle")}
      icon="fa-layer-group"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={loading}
      loadingLabel={t("common.loading")}
    >
      <Row className="g-4">
        <Col xs={12} lg={4}>
          <AdminPanelCard title={t("adminServerBackups.defaultTitle")} icon="fa-sliders">
            <p className="small text-secondary">{t("adminServerBackups.defaultHelp")}</p>
            <Form onSubmit={(e) => void onSaveDefault(e)}>
              <Form.Group className="mb-3">
                <Form.Label>{t("adminServerBackups.defaultLabel")}</Form.Label>
                <Form.Select
                  value={defaultKeepCount}
                  onChange={(e) => setDefaultKeepCount(Number(e.target.value))}
                >
                  {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
                    <option key={n} value={n}>
                      {t("backups.backupsCount", { n })}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
            </Form>
          </AdminPanelCard>
        </Col>

        <Col xs={12} lg={8}>
          <AdminPanelCard
            title={t("adminServerBackups.serversTitle", { count: servers.length })}
            icon="fa-server"
          >
            <Form.Group className="mb-3">
              <Form.Control
                type="search"
                placeholder={t("adminServerBackups.searchPlaceholder")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </Form.Group>

            {filtered.length === 0 ? (
              <Alert variant="light" className="border mb-0">
                {t("adminServerBackups.empty")}
              </Alert>
            ) : (
              <AdminInsetCard className="p-0 overflow-auto">
                <Table hover responsive className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>{t("adminServerBackups.colServer")}</th>
                      <th>{t("adminServerBackups.colOwner")}</th>
                      <th className="text-center">{t("adminServerBackups.colStored")}</th>
                      <th>{t("adminServerBackups.colMax")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const current = draft[row.id] ?? row.keepCount;
                      const dirty = current !== row.keepCount;
                      const over = row.backupCount > row.keepCount;
                      return (
                        <tr key={row.id}>
                          <td>
                            <Link to={`/servers/${row.id}`} className="fw-semibold text-decoration-none">
                              {row.name}
                            </Link>
                            {row.scheduleMode !== "off" && (
                              <Badge bg="secondary" className="ms-2">
                                {t("adminServerBackups.scheduled")}
                              </Badge>
                            )}
                          </td>
                          <td className="text-secondary">{row.ownerUsername}</td>
                          <td className="text-center">
                            <span className={over ? "text-warning fw-semibold" : undefined}>
                              {row.backupCount}
                            </span>
                            {over ? (
                              <div className="small text-warning">
                                {t("adminServerBackups.overLimit")}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ minWidth: "10rem" }}>
                            <Form.Select
                              size="sm"
                              value={current}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [row.id]: Number(e.target.value),
                                }))
                              }
                            >
                              {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
                                <option key={n} value={n}>
                                  {t("backups.backupsCount", { n })}
                                </option>
                              ))}
                            </Form.Select>
                          </td>
                          <td className="text-end">
                            <Button
                              size="sm"
                              variant={dirty ? "primary" : "outline-secondary"}
                              disabled={!dirty || savingId === row.id}
                              onClick={() => void onSaveRow(row.id)}
                            >
                              {savingId === row.id ? (
                                <Spinner size="sm" />
                              ) : (
                                t("common.save")
                              )}
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
        </Col>
      </Row>
    </AdminPageShell>
  );
}
