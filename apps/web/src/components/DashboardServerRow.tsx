import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { McServer, OnlinePlayersResponse, ServerStats, ServerUpdateInfo } from "@msm/shared";
import { addonKindFor, hasPermission } from "@msm/shared";
import { Button, Form } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { typeLabel } from "../utils";

function formatDiskLimit(diskMb: number): string {
  if (diskMb <= 0) return "∞";
  if (diskMb % 1024 === 0) return `${diskMb / 1024} GB`;
  return `${(diskMb / 1024).toFixed(1)} GB`;
}

function stopRowNav(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

function RowStat({
  icon,
  label,
  title,
  tone = "neutral",
  disabled,
  onClick,
  onKeyDown,
}: {
  icon: string;
  label: string;
  title?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  disabled?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}) {
  const interactive = Boolean(onClick) && !disabled;
  return (
    <span
      className={`server-row-stat server-row-stat--${tone}${
        interactive ? " is-clickable" : ""
      }${disabled ? " is-disabled" : ""}`}
      title={title}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={
        interactive
          ? (e) => {
              stopRowNav(e);
              onClick?.();
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (e) => {
              stopRowNav(e);
              onKeyDown?.(e);
            }
          : undefined
      }
    >
      <i className={`fa-solid ${icon}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
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

  const subLine = [
    `${typeLabel(s.type)} ${s.mcVersion}`,
    `:${s.port}`,
    `${Math.round(s.memoryMb / 1024)} GB RAM`,
  ].join(" · ");

  return (
    <article
      className={`server-row ${statusTone}`}
      onClick={() => navigate(`/servers/${s.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/servers/${s.id}`);
        }
      }}
    >
      <div className="server-row__head">
        {canWrite && onToggleSelected && (
          <Form.Check
            type="checkbox"
            checked={selected}
            aria-label={`Select ${s.name}`}
            className="server-row__select"
            onClick={stopRowNav}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelected();
            }}
          />
        )}

        <img
          className="server-row__icon"
          src={`/api/servers/${s.id}/icon?t=${s.hasIcon ? s.updatedAt : "default"}`}
          alt=""
          width={48}
          height={48}
        />

        <div className="server-row__identity min-w-0">
          <div className="server-row__title-row">
            <h2 className="server-row__name text-truncate">{s.name}</h2>
            <span className={`server-row__status ${statusTone}`}>
              <span className="server-row__status-dot" aria-hidden />
              {statusLabel(s.status)}
            </span>
            {s.autoRestart && (
              <span className="server-row__flag" title={t("dashboard.autoRestartTitle")}>
                <i className="fa-solid fa-rotate" aria-hidden />
                {t("dashboard.autoRestart")}
              </span>
            )}
            {update?.available && (
              <span className="server-row__flag server-row__flag--warn">
                <i className="fa-solid fa-arrow-up" aria-hidden />
                {t("dashboard.update")}
              </span>
            )}
          </div>
          <div className="server-row__sub text-truncate">{subLine}</div>
        </div>

        <div
          className="server-row__actions"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {canWrite && (
            <>
              <Button
                size="sm"
                variant="success"
                className="server-action-btn"
                disabled={busyId === s.id || s.status === "RUNNING" || s.status === "STARTING"}
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
      </div>

      <div className="server-row__stats">
        {isAdmin && (
          <RowStat
            icon="fa-user"
            label={s.ownerUsername ?? t("dashboard.unassigned")}
            title={t("dashboard.transferOwnerHint")}
            onClick={() => onTransfer(s)}
          />
        )}
        <RowStat
          icon="fa-hard-drive"
          label={diskUsed ? `${diskUsed} / ${diskLimit}` : diskLimit}
          title={t("dashboard.openResources")}
          onClick={() => navigate(`/servers/${s.id}?tab=resources`)}
        />
        {hasPermission(s.permissions, "player.read") && (
          <RowStat
            icon="fa-users"
            label={playersLabel}
            title={t("dashboard.onlinePlayers")}
            onClick={() => navigate(`/servers/${s.id}?tab=players`)}
          />
        )}
        {(hasPermission(s.permissions, "settings.read") ||
          hasPermission(s.permissions, "player.read")) && (
          <RowStat
            icon={s.whitelistEnabled ? "fa-shield-halved" : "fa-shield"}
            label={s.whitelistEnabled ? t("dashboard.whitelistOn") : t("dashboard.whitelistOff")}
            title={t("dashboard.changeWhitelist")}
            tone={s.whitelistEnabled ? "success" : "warning"}
            disabled={whitelistModalBusy || !hasPermission(s.permissions, "settings.update")}
            onClick={
              hasPermission(s.permissions, "settings.update")
                ? () => onOpenWhitelistModal(s.id)
                : undefined
            }
          />
        )}
        {supportsAddons && hasPermission(s.permissions, "addon.read") && (
          <RowStat
            icon="fa-puzzle-piece"
            label={
              (addonUpdates?.available ?? 0) > 0
                ? addonUpdates!.available === 1
                  ? t("common.updateOne", { count: addonUpdates!.available })
                  : t("common.updateMany", { count: addonUpdates!.available })
                : addonUpdates
                  ? t("common.upToDate")
                  : t("common.updatesEllipsis")
            }
            title={t("dashboard.openAddons")}
            tone={(addonUpdates?.available ?? 0) > 0 ? "danger" : "neutral"}
            onClick={() => navigate(`/servers/${s.id}?tab=addons`)}
          />
        )}
      </div>

      {update?.available && <div className="server-row__note text-warning">{update.message}</div>}
      {s.errorMessage && <div className="server-row__note text-danger">{s.errorMessage}</div>}

      {live && stats && (
        <div className="server-row__metrics">
          <div className="server-row__metric">
            <div className="server-row__metric-top">
              <span>{t("resources.cpu")}</span>
              <strong>{Math.min(100, stats.cpuPercent).toFixed(1)}%</strong>
            </div>
            <div className="server-meter">
              <span style={{ width: `${Math.min(100, stats.cpuPercent)}%` }} />
            </div>
          </div>
          <div className="server-row__metric">
            <div className="server-row__metric-top">
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
    </article>
  );
});
