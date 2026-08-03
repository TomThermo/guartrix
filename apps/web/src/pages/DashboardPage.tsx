import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  McServer,
  OnlinePlayersResponse,
  ServerDetail,
  ServerStats,
  ServerUpdateInfo,
} from "@msm/shared";
import { addonKindFor, canCreateServer, hasPermission } from "@msm/shared";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { TransferOwnerModal } from "../components/TransferOwnerModal";
import { WhitelistStartModal } from "../components/WhitelistStartModal";
import { WhitelistToggleModal } from "../components/WhitelistToggleModal";
import { typeIcon, typeLabel } from "../utils";

function formatDiskLimit(diskMb: number): string {
  if (diskMb <= 0) return "∞";
  if (diskMb % 1024 === 0) return `${diskMb / 1024} GB`;
  return `${(diskMb / 1024).toFixed(1)} GB`;
}

function stopRowNav(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

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

  // Single visible-tab timer: list+stats+online every 15s; server/addon update
  // checks keep ~60s / ~120s cadence via tick counters (pause-on-hidden preserved).
  const pollTick = useRef(0);
  useVisibleInterval(() => {
    pollTick.current += 1;
    const n = pollTick.current;
    void refresh();
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
        <div className="server-list">
          {filtered.map((s) => {
            const stats = statsMap[s.id];
            const live = !!stats?.running;
            const online = onlineMap[s.id];
            const update = updatesMap[s.id];
            const addonUpdates = addonUpdatesMap[s.id];
            const supportsAddons = !!addonKindFor(s.type);
            const diskUsed = stats?.disk?.totalLabel;
            const diskLimit = formatDiskLimit(s.diskMb);
            const playersLabel = online
              ? `${online.playersOnline}${online.playersMax > 0 ? `/${online.playersMax}` : ""}`
              : live
                ? "…/…"
                : "0/0";
            const statusTone =
              s.status === "RUNNING"
                ? "is-online"
                : s.status === "ERROR"
                  ? "is-error"
                  : s.status === "STARTING"
                    ? "is-starting"
                    : s.status === "STOPPING"
                      ? "is-stopping"
                      : s.status === "CREATING" || s.status === "TRANSFERRING"
                        ? "is-busy"
                        : "is-offline";

            return (
              <article
                key={s.id}
                className={`server-row ${statusTone}`}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/servers/${s.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/servers/${s.id}`);
                  }
                }}
              >
                <div className="server-row-main">
                  <img
                    className="server-row-icon"
                    src={`/api/servers/${s.id}/icon?t=${s.hasIcon ? s.updatedAt : "default"}`}
                    alt=""
                    width={56}
                    height={56}
                  />

                  <div className="server-row-copy min-w-0">
                    <div className="server-row-title">
                      <h2 className="server-row-name">{s.name}</h2>
                      <span className={`server-status ${statusTone}`}>
                        <span className="server-status-dot" aria-hidden />
                        {statusLabel(s.status)}
                      </span>
                      {s.autoRestart && (
                        <span className="server-update-pill" title={t("dashboard.autoRestartTitle")}>
                          <i className="fa-solid fa-rotate" />
                          {t("dashboard.autoRestart")}
                        </span>
                      )}
                      {update?.available && (
                        <span className="server-update-pill">
                          <i className="fa-solid fa-arrow-up" />
                          {t("dashboard.update")}
                        </span>
                      )}
                    </div>

                    <div className="server-row-meta">
                      <span>
                        <i className={`fa-solid ${typeIcon(s.type)}`} />
                        {typeLabel(s.type)} {s.mcVersion}
                      </span>
                      <span className="server-meta-sep" aria-hidden>
                        ·
                      </span>
                      <span>:{s.port}</span>
                      <span className="server-meta-sep" aria-hidden>
                        ·
                      </span>
                      <span>{Math.round(s.memoryMb / 1024)} GB RAM</span>
                      {isAdmin && (
                        <>
                          <span className="server-meta-sep" aria-hidden>
                            ·
                          </span>
                          <Badge
                            bg={s.ownerUsername ? "dark" : "secondary"}
                            className="server-owner-badge"
                            title={t("dashboard.transferOwnerHint")}
                          >
                            <i className="fa-solid fa-user me-1" />
                            {s.ownerUsername ?? t("dashboard.unassigned")}
                          </Badge>
                        </>
                      )}
                      <span className="server-meta-sep" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        className="server-row-chip"
                        title={t("dashboard.openResources")}
                        onClick={(e) => {
                          stopRowNav(e);
                          navigate(`/servers/${s.id}?tab=resources`);
                        }}
                      >
                        <i className="fa-solid fa-hard-drive" aria-hidden />
                        {diskUsed ? `${diskUsed} / ${diskLimit}` : diskLimit}
                      </button>
                      {hasPermission(s.permissions, "player.read") && (
                        <>
                          <span className="server-meta-sep" aria-hidden>
                            ·
                          </span>
                          <button
                            type="button"
                            className="server-row-chip"
                            title={t("dashboard.onlinePlayers")}
                            onClick={(e) => {
                              stopRowNav(e);
                              navigate(`/servers/${s.id}?tab=players`);
                            }}
                          >
                            <i className="fa-solid fa-users" aria-hidden />
                            {playersLabel}
                          </button>
                        </>
                      )}
                      {(hasPermission(s.permissions, "settings.read") ||
                        hasPermission(s.permissions, "player.read")) && (
                        <>
                          <span className="server-meta-sep" aria-hidden>
                            ·
                          </span>
                          <button
                            type="button"
                            className={`server-row-chip ${s.whitelistEnabled ? "is-on" : "is-warn"}`}
                            title={t("dashboard.changeWhitelist")}
                            disabled={
                              whitelistModalBusy ||
                              !hasPermission(s.permissions, "settings.update")
                            }
                            onClick={(e) => {
                              stopRowNav(e);
                              if (!hasPermission(s.permissions, "settings.update")) return;
                              void openWhitelistModal(s.id);
                            }}
                          >
                            <i
                              className={`fa-solid ${s.whitelistEnabled ? "fa-shield-halved" : "fa-shield"}`}
                              aria-hidden
                            />
                            {s.whitelistEnabled
                              ? t("dashboard.whitelistOn")
                              : t("dashboard.whitelistOff")}
                          </button>
                        </>
                      )}
                      {supportsAddons &&
                        hasPermission(s.permissions, "addon.read") && (
                        <>
                          <span className="server-meta-sep" aria-hidden>
                            ·
                          </span>
                          <button
                            type="button"
                            className={`server-row-chip ${
                              (addonUpdates?.available ?? 0) > 0 ? "is-danger" : ""
                            }`}
                            title={t("dashboard.openAddons")}
                            onClick={(e) => {
                              stopRowNav(e);
                              navigate(`/servers/${s.id}?tab=addons`);
                            }}
                          >
                            <i className="fa-solid fa-puzzle-piece" aria-hidden />
                            {(addonUpdates?.available ?? 0) > 0
                              ? (addonUpdates!.available === 1
                                  ? t("common.updateOne", { count: addonUpdates!.available })
                                  : t("common.updateMany", { count: addonUpdates!.available }))
                              : addonUpdates
                                ? t("common.upToDate")
                                : t("common.updatesEllipsis")}
                          </button>
                        </>
                      )}
                    </div>

                    {update?.available && (
                      <div className="server-row-note text-warning">{update.message}</div>
                    )}
                    {s.errorMessage && (
                      <div className="server-row-note text-danger">{s.errorMessage}</div>
                    )}

                    {live && stats && (
                      <div className="server-metrics">
                        <div className="server-metric">
                          <div className="server-metric-top">
                            <span>{t("resources.cpu")}</span>
                            <strong>{Math.min(100, stats.cpuPercent).toFixed(1)}%</strong>
                          </div>
                          <div className="server-meter">
                            <span style={{ width: `${Math.min(100, stats.cpuPercent)}%` }} />
                          </div>
                        </div>
                        <div className="server-metric">
                          <div className="server-metric-top">
                            <span>{t("resources.ram")}</span>
                            <strong>
                              {stats.memoryUsedLabel}
                              <span className="text-secondary"> / {stats.memoryLimitLabel}</span>
                            </strong>
                          </div>
                          <div className="server-meter">
                            <span style={{ width: `${Math.min(100, stats.memoryPercent)}%` }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {live && online && online.players.length > 0 && (
                      <div className="server-players">
                        {online.players.map((p) => p.name).join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="server-row-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {canWrite && (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        className="server-action-btn"
                        disabled={
                          busyId === s.id || s.status === "RUNNING" || s.status === "STARTING"
                        }
                        title={t("dashboard.start")}
                        onClick={() => requestStart(s)}
                      >
                        <i className="fa-solid fa-play" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="server-action-btn"
                        disabled={busyId === s.id || s.status === "STOPPED"}
                        title={t("dashboard.stop")}
                        onClick={() => void act(s.id, "stop")}
                      >
                        <i className="fa-solid fa-stop" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="server-action-btn"
                        disabled={busyId === s.id}
                        title={t("dashboard.restart")}
                        onClick={() => void act(s.id, "restart")}
                      >
                        <i className="fa-solid fa-rotate-right" />
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      className="server-action-btn"
                      title={t("dashboard.transferOwner")}
                      onClick={() => setTransferServer(s)}
                    >
                      <i className="fa-solid fa-user-tag" />
                    </Button>
                  )}
                  <Link
                    to={`/servers/${s.id}`}
                    className="btn btn-sm btn-outline-secondary server-action-btn"
                    title={t("dashboard.open")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i className="fa-solid fa-arrow-right" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
          )}
        </>
      )}
    </>
  );
}
