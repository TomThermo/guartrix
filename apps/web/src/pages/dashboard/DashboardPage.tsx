import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  McServer,
  OnlinePlayersResponse,
  ServerDetail,
  ServerStats,
  ServerUpdateInfo,
} from "@msm/shared";
import { canCreateServer } from "@msm/shared";
import { Alert } from "react-bootstrap";
import { api, ApiError } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { useVisibleInterval } from "../../hooks/useVisibleInterval";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardModals } from "./DashboardModals";
import { DashboardServerList } from "./DashboardServerList";
import { filterServers, statusLabelFor } from "./filterServers";
import type { StatusFilter } from "./types";

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  function statusLabel(status: McServer["status"]): string {
    return statusLabelFor(status, t);
  }
  const canWrite = user?.role !== "VIEWER";
  const canCreate = canCreateServer(user);
  const isAdmin = user?.role === "ADMIN";
  const [servers, setServers] = useState<McServer[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const PAGE_SIZE = 100;
  const [statsMap, setStatsMap] = useState<Record<string, ServerStats>>({});
  const [onlineMap, setOnlineMap] = useState<Record<string, OnlinePlayersResponse>>({});
  const [updatesMap, setUpdatesMap] = useState<Record<string, ServerUpdateInfo>>({});
  const [addonUpdatesMap, setAddonUpdatesMap] = useState<Record<string, { available: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [whitelistPrompt, setWhitelistPrompt] = useState<McServer | null>(null);
  const [whitelistModal, setWhitelistModal] = useState<ServerDetail | null>(null);
  const [whitelistModalBusy, setWhitelistModalBusy] = useState(false);
  const [transferServer, setTransferServer] = useState<McServer | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [nodeFilter, setNodeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const refreshLive = useCallback(async () => {
    try {
      const [stats, online] = await Promise.all([api.getAllStats(), api.getAllOnlinePlayers()]);
      setStatsMap(stats);
      setOnlineMap(online);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadFailed"));
    }
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      const [page, stats, online] = await Promise.all([
        api.listServers({ limit: PAGE_SIZE, offset: 0 }),
        api.getAllStats(),
        api.getAllOnlinePlayers(),
      ]);
      const list = Array.isArray(page) ? page : page.servers;
      const total = Array.isArray(page) ? page.length : page.total;
      setServers(list);
      setServerTotal(total);
      setListOffset(list.length);
      setStatsMap(stats);
      setOnlineMap(online);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMoreServers = useCallback(async () => {
    if (loadingMore || servers.length >= serverTotal) return;
    setLoadingMore(true);
    try {
      const page = await api.listServers({
        limit: PAGE_SIZE,
        offset: listOffset,
      });
      const list = Array.isArray(page) ? page : page.servers;
      const total = Array.isArray(page) ? servers.length + list.length : page.total;
      setServers((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...list.filter((s) => !seen.has(s.id))];
      });
      setServerTotal(total);
      setListOffset((o) => o + list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, servers.length, serverTotal, listOffset, t]);

  const refreshUpdates = useCallback(async () => {
    try {
      const updates = await api.getAllServerUpdates();
      setUpdatesMap(updates);
    } catch {
      // non-fatal
    }
  }, []);

  const refreshAddonUpdates = useCallback(async () => {
    try {
      const updates = await api.getAllAddonUpdates();
      setAddonUpdatesMap(updates);
    } catch {
      // non-fatal — Modrinth may be briefly unreachable
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshUpdates();
    // Defer Modrinth addon sweeps so first paint stays light.
    const addonTimer = window.setTimeout(() => void refreshAddonUpdates(), 12_000);
    return () => window.clearTimeout(addonTimer);
  }, [refresh, refreshUpdates, refreshAddonUpdates]);

  const pollTick = useRef(0);
  useVisibleInterval(() => {
    pollTick.current += 1;
    const n = pollTick.current;
    // Live stats often; full list / version less often; addon updates rarely.
    if (n % 5 === 0) void refresh();
    else void refreshLive();
    if (n % 5 === 0) void refreshUpdates();
    if (n % 15 === 0) void refreshAddonUpdates();
  }, 20_000);

  async function openWhitelistModal(serverId: string) {
    setWhitelistModalBusy(true);
    setError(null);
    try {
      const detail = await api.getServer(serverId);
      setWhitelistModal(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.whitelistLoadFailed"));
    } finally {
      setWhitelistModalBusy(false);
    }
  }

  const nodeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of servers) {
      if (s.nodeId) map.set(s.nodeId, s.nodeName || s.nodeId);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [servers]);

  const typeOptions = useMemo(() => {
    return [...new Set(servers.map((s) => s.type))].sort();
  }, [servers]);

  const filtered = useMemo(
    () => filterServers(servers, query, statusFilter, nodeFilter, typeFilter),
    [servers, query, statusFilter, nodeFilter, typeFilter],
  );

  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...filteredIds]);
    });
  }

  async function bulkAct(action: "start" | "stop" | "restart") {
    if (!canWrite || selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const id of selectedIds) {
        const server = servers.find((s) => s.id === id);
        if (!server) continue;
        if (action === "start") {
          if (!server.whitelistEnabled) continue;
          await api.startServer(id);
        } else if (action === "stop") {
          await api.stopServer(id);
        } else {
          await api.restartServer(id);
        }
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  function requestStart(server: McServer) {
    if (!server.whitelistEnabled) {
      setWhitelistPrompt(server);
      return;
    }
    void act(server.id, "start");
  }

  async function act(id: string, action: "start" | "stop" | "restart", enableWhitelist = false) {
    setBusyId(id);
    setWhitelistPrompt(null);
    try {
      if (action === "start") {
        if (enableWhitelist) {
          await api.updateServer(id, {
            properties: { "white-list": "true", "enforce-whitelist": "true" },
          });
        }
        await api.startServer(id);
      } else if (action === "stop") await api.stopServer(id);
      else await api.restartServer(id);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      const licenseBlocked =
        (action === "start" || action === "restart") &&
        ((err instanceof ApiError && err.code === "LICENSE_INVALID") || /license/i.test(message));
      if (licenseBlocked) {
        navigate(`/servers/${id}`, {
          state: {
            consoleNotice:
              message && /license|administrator/i.test(message)
                ? message
                : "ERROR: Cannot start — panel license expired or invalid. Please contact your administrator.",
          },
        });
      } else {
        setError(message);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      icon="fa-server"
      loading={loading}
      loadingLabel={t("common.loading")}
      error={error}
      onDismissError={() => setError(null)}
      extraHeader={null}
    >
      {!canCreate && canWrite && user?.maxServers != null && user.maxServers > 0 && (
        <Alert variant="secondary">
          {t("dashboard.serverLimit", {
            count: user.serverCount ?? 0,
            max: user.maxServers,
          })}
        </Alert>
      )}
      <DashboardModals
        whitelistPrompt={whitelistPrompt}
        busyId={busyId}
        onClearWhitelistPrompt={() => setWhitelistPrompt(null)}
        onStartAnyway={() => void act(whitelistPrompt!.id, "start")}
        onEnableAndStart={() => void act(whitelistPrompt!.id, "start", true)}
        whitelistModal={whitelistModal}
        whitelistModalBusy={whitelistModalBusy}
        onClearWhitelistModal={() => setWhitelistModal(null)}
        onWhitelistError={(message) => setError(message)}
        onWhitelistSaved={(updated) => {
          setServers((prev) =>
            prev.map((s) =>
              s.id === updated.id
                ? {
                    ...s,
                    whitelistEnabled: updated.properties["white-list"] === "true",
                    updatedAt: updated.updatedAt,
                  }
                : s,
            ),
          );
          setWhitelistModal(null);
          void refresh();
        }}
        transferServer={transferServer}
        onClearTransfer={() => setTransferServer(null)}
        onTransferred={(updated) => {
          setServers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
          setTransferServer(null);
        }}
      />

      {servers.length === 0 ? (
        <DashboardEmptyState canCreate={canCreate} />
      ) : (
        <>
          <DashboardFilters
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            nodeFilter={nodeFilter}
            onNodeFilterChange={setNodeFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            nodeOptions={nodeOptions}
            typeOptions={typeOptions}
            filteredCount={filtered.length}
            totalCount={servers.length}
          />
          {filtered.length === 0 ? (
            <Alert variant="secondary">{t("dashboard.noMatch")}</Alert>
          ) : (
            <DashboardServerList
              filtered={filtered}
              servers={servers}
              serverTotal={serverTotal}
              statsMap={statsMap}
              onlineMap={onlineMap}
              updatesMap={updatesMap}
              addonUpdatesMap={addonUpdatesMap}
              canWrite={canWrite}
              isAdmin={isAdmin}
              busyId={busyId}
              bulkBusy={bulkBusy}
              selectedIds={selectedIds}
              allFilteredSelected={allFilteredSelected}
              whitelistModalBusy={whitelistModalBusy}
              loadingMore={loadingMore}
              statusLabel={statusLabel}
              onToggleSelected={toggleSelected}
              onToggleSelectAll={toggleSelectAllFiltered}
              onBulkAct={(action) => void bulkAct(action)}
              onRequestStart={requestStart}
              onStop={(id) => void act(id, "stop")}
              onRestart={(id) => void act(id, "restart")}
              onTransfer={setTransferServer}
              onOpenWhitelistModal={(id) => void openWhitelistModal(id)}
              onLoadMore={() => void loadMoreServers()}
            />
          )}
        </>
      )}
    </AdminPageShell>
  );
}
