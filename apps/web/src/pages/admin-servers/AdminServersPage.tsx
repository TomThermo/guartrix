import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import type { AdminServerRow, AuthUser } from "@guartrix/shared";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import { AdminServerEditModal } from "./AdminServerEditModal";
import { AdminServersTable } from "./AdminServersTable";

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
      <AdminServersTable
        servers={servers}
        filtered={filtered}
        filter={filter}
        onFilterChange={setFilter}
        onEdit={setEditRow}
      />

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
