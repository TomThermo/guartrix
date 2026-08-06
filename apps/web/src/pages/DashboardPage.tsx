import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  McServer,
  OnlinePlayersResponse,
  ServerDetail,
  ServerStats,
  ServerUpdateInfo,
} from "@msm/shared";
import { canCreateServer } from "@msm/shared";
import { Alert, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { DashboardServerRow } from "../components/DashboardServerRow";
import { TransferOwnerModal } from "../components/TransferOwnerModal";
import { WhitelistStartModal } from "../components/WhitelistStartModal";
import { WhitelistToggleModal } from "../components/WhitelistToggleModal";
import { typeLabel } from "../utils";

type StatusFilter = "all" | "online" | "offline" | "busy" | "error";

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  function statusLabel(status: McServer["status"]): string {
    switch (status) {
      case "RUNNING":
        return t("dashboard.online");
      case "STARTING":
        return "Starting";
      case "STOPPING":
        return "Stopping";
      case "CREATING":
        return "Creating";
      case "TRANSFERRING":
        return "Moving";
      case "ERROR":
        return t("dashboard.error");
      default:
        return t("dashboard.offline");
    }
  }
  const canWrite = user?.role !== "VIEWER";
  const canCreate = canCreateServer(user);
  const isAdmin = user?.role === "ADMIN";
  const [servers, setServers] = useState<McServer[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, ServerStats>>({});
  const [onlineMap, setOnlineMap] = useState<Record<string, OnlinePlayersResponse>>({});
  const [updatesMap, setUpdatesMap] = useState<Record<string, ServerUpdateInfo>>({});
  const [addonUpdatesMap, setAddonUpdatesMap] = useState<
    Record<string, { available: number }>
  >({});
  const [loading, setLoading] = useState(true);
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
      const [stats, online] = await Promise.all([
        api.getAllStats(),
        api.getAllOnlinePlayers(),
      ]);
      setStatsMap(stats);
      setOnlineMap(online);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadFailed"));
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, stats, online] = await Promise.all([
        api.listServers(),
        api.getAllStats(),
        api.getAllOnlinePlayers(),
      ]);
      setServers(list);
      setStatsMap(stats);
      setOnlineMap(online);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

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
    void refreshAddonUpdates();
  }, [refresh, refreshUpdates, refreshAddonUpdates]);

  // Visible-tab timer: stats+online every 15s; full server list every ~60s;
  // update checks keep ~60s / ~120s cadence (pause-on-hidden preserved).
  const pollTick = useRef(0);
  useVisibleInterval(() => {
    pollTick.current += 1;
    const n = pollTick.current;
    if (n % 4 === 0) void refresh();
    else void refreshLive();
    if (n % 4 === 0) void refreshUpdates();
    if (n % 8 === 0) void refreshAddonUpdates();
  }, 15_000);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((s) => {
      if (statusFilter === "online" && s.status !== "RUNNING") return false;
      if (statusFilter === "offline" && s.status !== "STOPPED") return false;
      if (
        statusFilter === "busy" &&
        s.status !== "STARTING" &&
        s.status !== "STOPPING" &&
        s.status !== "CREATING" &&
        s.status !== "TRANSFERRING"
      ) {
        return false;
      }
      if (statusFilter === "error" && s.status !== "ERROR") return false;
      if (nodeFilter !== "all" && s.nodeId !== nodeFilter) return false;
      if (typeFilter !== "all" && s.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        s.name,
        s.type,
        s.mcVersion,
        s.ownerUsername,
        s.nodeName,
        s.subdomain,
        String(s.port),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [servers, query, statusFilter, nodeFilter, typeFilter]);

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

  async function act(
    id: string,
    action: "start" | "stop" | "restart",
    enableWhitelist = false,
  ) {
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
        ((err instanceof ApiError && err.code === "LICENSE_INVALID") ||
          /license/i.test(message));
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
            <i className="fa-solid fa-server me-2 text-primary" />
            {t("dashboard.title")}
          </h1>
          <p className="text-secondary mb-0">{t("dashboard.subtitle")}</p>
        </div>
        {canCreate && (
          <Link to="/servers/new" className="btn btn-primary page-action-btn">
            <i className="fa-solid fa-plus me-2" />
            {t("dashboard.newServer")}
          </Link>
        )}
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!canCreate &&
        canWrite &&
        user?.maxServers != null &&
        user.maxServers > 0 && (
        <Alert variant="secondary">
          {t("dashboard.serverLimit", {
            count: user.serverCount ?? 0,
            max: user.maxServers,
          })}
        </Alert>
      )}
      {whitelistPrompt && (
        <WhitelistStartModal
          serverName={whitelistPrompt.name}
          busy={busyId === whitelistPrompt.id}
          onCancel={() => setWhitelistPrompt(null)}
          onStartAnyway={() => void act(whitelistPrompt.id, "start")}
          onEnableAndStart={() => void act(whitelistPrompt.id, "start", true)}
        />
      )}

      {whitelistModal && (
        <WhitelistToggleModal
          server={whitelistModal}
          busy={whitelistModalBusy}
          onCancel={() => setWhitelistModal(null)}
          onError={(message) => setError(message)}
          onSaved={(updated) => {
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
        />
      )}

      {transferServer && (
        <TransferOwnerModal
          server={transferServer}
          onCancel={() => setTransferServer(null)}
          onTransferred={(updated) => {
            setServers((prev) =>
              prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
            );
            setTransferServer(null);
          }}
        />
      )}

      {servers.length === 0 ? (
        <Card className="border-0 shadow-sm text-center py-5">
          <Card.Body>
            <i className="fa-solid fa-cube fa-2x text-secondary mb-3" />
            <h2 className="h5">{t("dashboard.emptyTitle")}</h2>
            <p className="text-secondary">{t("dashboard.emptyBlurb")}</p>
            {canCreate && (
              <Link to="/servers/new" className="btn btn-primary">
                {t("dashboard.createServer")}
              </Link>
            )}
          </Card.Body>
        </Card>
      ) : (
        <>
          <Row className="g-2 mb-3 align-items-end">
            <Col md={4}>
              <Form.Label className="small text-secondary mb-1">
                {t("dashboard.search")}
              </Form.Label>
              <Form.Control
                value={query}
                placeholder={t("dashboard.searchPlaceholder")}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Col>
            <Col xs={6} md={2}>
              <Form.Label className="small text-secondary mb-1">
                {t("dashboard.status")}
              </Form.Label>
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">{t("dashboard.allStatuses")}</option>
                <option value="online">{t("dashboard.online")}</option>
                <option value="offline">{t("dashboard.offline")}</option>
                <option value="busy">{t("dashboard.busy")}</option>
                <option value="error">{t("dashboard.error")}</option>
              </Form.Select>
            </Col>
            <Col xs={6} md={3}>
              <Form.Label className="small text-secondary mb-1">
                {t("dashboard.node")}
              </Form.Label>
              <Form.Select
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
              >
                <option value="all">{t("dashboard.allNodes")}</option>
                {nodeOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={2}>
              <Form.Label className="small text-secondary mb-1">
                {t("dashboard.type")}
              </Form.Label>
              <Form.Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">{t("dashboard.allTypes")}</option>
                {typeOptions.map((typeId) => (
                  <option key={typeId} value={typeId}>
                    {typeLabel(typeId)}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={6} md={1} className="pb-2">
              <span className="small text-secondary">
                {filtered.length}/{servers.length}
              </span>
            </Col>
          </Row>
          {filtered.length === 0 ? (
            <Alert variant="secondary">{t("dashboard.noMatch")}</Alert>
          ) : (
        <>
          {canWrite && (
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <Form.Check
                type="checkbox"
                id="dashboard-select-all"
                label={t("dashboard.selectAllFiltered")}
                checked={allFilteredSelected}
                onChange={() => toggleSelectAllFiltered()}
              />
              <span className="text-secondary small">
                {t("dashboard.selectedCount", { count: selectedIds.size })}
              </span>
              <div className="flex-grow-1" />
              <Button
                size="sm"
                variant="success"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void bulkAct("start")}
              >
                {t("dashboard.bulkStart")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void bulkAct("stop")}
              >
                {t("dashboard.bulkStop")}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={bulkBusy || selectedIds.size === 0}
                onClick={() => void bulkAct("restart")}
              >
                {t("dashboard.bulkRestart")}
              </Button>
            </div>
          )}
        <div className="server-list">
          {filtered.map((s) => (
            <DashboardServerRow
              key={s.id}
              server={s}
              stats={statsMap[s.id]}
              online={onlineMap[s.id]}
              update={updatesMap[s.id]}
              addonUpdates={addonUpdatesMap[s.id]}
              canWrite={canWrite}
              isAdmin={isAdmin}
              busyId={busyId}
              bulkBusy={bulkBusy}
              selected={selectedIds.has(s.id)}
              onToggleSelected={() => toggleSelected(s.id)}
              whitelistModalBusy={whitelistModalBusy}
              statusLabel={statusLabel}
              onRequestStart={requestStart}
              onStop={(id) => void act(id, "stop")}
              onRestart={(id) => void act(id, "restart")}
              onTransfer={setTransferServer}
              onOpenWhitelistModal={(id) => void openWhitelistModal(id)}
            />
          ))}
        </div>
        </>
          )}
        </>
      )}
    </>
  );
}
