import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  McServer,
  OnlinePlayersResponse,
  ServerStats,
  ServerUpdateInfo,
} from "@msm/shared";
import { addonKindFor, hasPermission } from "@msm/shared";
import { Badge, Button, Form } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { typeIcon, typeLabel } from "../utils";

function formatDiskLimit(diskMb: number): string {
  if (diskMb <= 0) return "∞";
  if (diskMb % 1024 === 0) return `${diskMb / 1024} GB`;
  return `${(diskMb / 1024).toFixed(1)} GB`;
}

function stopRowNav(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

interface Props {
  server: McServer;
  stats?: ServerStats;
  online?: OnlinePlayersResponse;
  update?: ServerUpdateInfo;
  addonUpdates?: { available: number };
  canWrite: boolean;
  isAdmin: boolean;
  busyId: string | null;
  bulkBusy?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  whitelistModalBusy: boolean;
  statusLabel: (status: McServer["status"]) => string;
  onRequestStart: (server: McServer) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onTransfer: (server: McServer) => void;
  onOpenWhitelistModal: (id: string) => void;
}

export const DashboardServerRow = memo(function DashboardServerRow({
  server: s,
  stats,
  online,
  update,
  addonUpdates,
  canWrite,
  isAdmin,
  busyId,
  bulkBusy = false,
  selected = false,
  onToggleSelected,
  whitelistModalBusy,
  statusLabel,
  onRequestStart,
  onStop,
  onRestart,
  onTransfer,
  onOpenWhitelistModal,
}: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const live = !!stats?.running;
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
        {canWrite && onToggleSelected && (
          <Form.Check
            type="checkbox"
            checked={selected}
            aria-label={`Select ${s.name}`}
            className="server-row-select me-2"
            onClick={stopRowNav}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelected();
            }}
          />
        )}
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
                    onOpenWhitelistModal(s.id);
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
              onClick={() => onRequestStart(s)}
            >
              <i className="fa-solid fa-play" />
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              className="server-action-btn"
              disabled={busyId === s.id || bulkBusy || s.status === "STOPPED"}
              title={t("dashboard.stop")}
              onClick={() => onStop(s.id)}
            >
              <i className="fa-solid fa-stop" />
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              className="server-action-btn"
              disabled={busyId === s.id || bulkBusy}
              title={t("dashboard.restart")}
              onClick={() => onRestart(s.id)}
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
            onClick={() => onTransfer(s)}
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
});
