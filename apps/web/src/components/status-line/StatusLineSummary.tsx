import type { ReactNode } from "react";
import type { AdminStatusResponse } from "@guartrix/shared";
import { Link } from "react-router-dom";
import { Badge } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { HealthDot } from "./StatusLineUi";
import { formatUptime } from "./status-line-utils";

function StatusTile({
  icon,
  iconClass,
  title,
  ok,
  statusLabel,
  rows,
}: {
  icon: string;
  iconClass?: string;
  title: string;
  ok: boolean;
  statusLabel: string;
  rows: Array<{ label: string; value: ReactNode; mono?: boolean }>;
}) {
  return (
    <div className={`status-tile${ok ? "" : " status-tile--bad"}`}>
      <div className="status-tile__head">
        <span className={`status-tile__icon ${iconClass ?? ""}`.trim()} aria-hidden>
          <i className={`fa-solid ${icon}`} />
        </span>
        <div className="min-w-0">
          <div className="status-tile__title">{title}</div>
          <div className="status-tile__status">
            <HealthDot ok={ok} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </div>
      <dl className="status-tile__kv">
        {rows.map((row) => (
          <div key={row.label} className="status-tile__row">
            <dt>{row.label}</dt>
            <dd className={row.mono ? "font-monospace" : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  ok,
}: {
  icon: string;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className={`status-chip${ok ? "" : " status-chip--bad"}`}>
      <span className="status-chip__icon" aria-hidden>
        <i className={`fa-solid ${icon}`} />
      </span>
      <div className="min-w-0">
        <div className="status-chip__label">{label}</div>
        <div className="status-chip__value">
          <HealthDot ok={ok} />
          {value}
        </div>
      </div>
    </div>
  );
}

export function StatusLineOverview({ data }: { data: AdminStatusResponse }) {
  const { t } = useI18n();
  const panel = data.panel;
  const apiInfo = panel?.api;
  const version = panel?.version;

  const nodesOnline = data.nodes.filter((n) => n.reachable).length;
  const nodesTotal = data.nodes.length;
  const gameContainers = data.nodes.reduce(
    (sum, n) => sum + n.containers.filter((c) => !c.isMysql).length,
    0,
  );
  const gameRunning = data.nodes.reduce(
    (sum, n) =>
      sum + n.containers.filter((c) => !c.isMysql && c.state.toLowerCase() === "running").length,
    0,
  );
  const mysqlOk = data.nodes.every((n) => !n.mysql || n.mysql.running);
  const sftpOk = data.nodes.every((n) => !n.sftp || (n.reachable && n.sftp.listening));

  const redisOk = !panel?.redis?.enabled ? true : Boolean(panel.redis.connected);

  return (
    <div className="status-overview">
      <section className="admin-inset-card status-overview__banner">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex flex-wrap align-items-center gap-2 small">
            <span className="status-arch-pill">
              <i className="fa-solid fa-globe me-1" aria-hidden />
              Web
            </span>
            <span className="text-secondary">→</span>
            <span className="status-arch-pill">
              <i className="fa-solid fa-server me-1" aria-hidden />
              API
            </span>
            <span className="text-secondary">→</span>
            <span className="status-arch-pill">
              <i className="fa-solid fa-microchip me-1" aria-hidden />
              Daemon
            </span>
            <span className="text-secondary">→</span>
            <span className="status-arch-pill">
              <i className="fa-solid fa-cube me-1" aria-hidden />
              Docker
            </span>
          </div>
          {version ? (
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="font-monospace fw-semibold">v{version.current}</span>
              {version.upToDate && !version.belowMinimum ? (
                <Badge bg="success">{t("common.upToDate")}</Badge>
              ) : version.belowMinimum ? (
                <Badge bg="danger">{t("admin.statusBelowMin")}</Badge>
              ) : version.updateAvailable ? (
                <Badge bg="warning" text="dark">
                  {t("admin.statusUpdateAvailable")}
                </Badge>
              ) : (
                <Badge bg="secondary">{t("admin.statusChannelUnknown")}</Badge>
              )}
              <Link className="btn btn-sm btn-outline-secondary" to="/admin/license">
                <i className="fa-solid fa-key me-1" aria-hidden />
                {t("nav.license")}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-desktop" aria-hidden />
          {t("admin.statusPanel")}
        </h2>
        <div className="status-tile-grid">
          <StatusTile
            icon="fa-globe"
            iconClass="text-primary"
            title={t("admin.statusWeb")}
            ok={Boolean(panel?.web?.ok)}
            statusLabel={panel?.web?.ok ? t("common.online") : t("admin.statusOffline")}
            rows={[
              { label: "URL", value: panel?.web?.url ?? "—", mono: true },
              {
                label: "HTTP",
                value: panel?.web?.httpPort ?? "—",
              },
              {
                label: "HTTPS",
                value: panel?.web?.httpsPort ?? t("common.off"),
              },
              { label: "PID", value: panel?.web?.pid ?? "—" },
            ]}
          />
          <StatusTile
            icon="fa-server"
            title={t("admin.statusApi")}
            ok={Boolean(apiInfo?.ok)}
            statusLabel={t("common.online")}
            rows={[
              { label: t("admin.nodeConnectPort"), value: panel?.api?.port ?? "—" },
              {
                label: t("admin.nodeUptime"),
                value: apiInfo ? formatUptime(apiInfo.uptime) : "—",
              },
              {
                label: t("admin.nodeMemoryLive"),
                value: apiInfo ? `${apiInfo.memoryRssMb} MB` : "—",
              },
              { label: "PID", value: apiInfo?.pid ?? "—" },
              { label: "Node.js", value: apiInfo?.nodeVersion ?? "—" },
            ]}
          />
          <StatusTile
            icon="fa-heart-pulse"
            iconClass="text-danger"
            title={t("admin.statusWatchdog")}
            ok={Boolean(panel?.watchdog?.ok)}
            statusLabel={panel?.watchdog?.ok ? t("admin.statusActive") : t("admin.statusInactive")}
            rows={[{ label: "PID", value: panel?.watchdog?.pid ?? "—" }]}
          />
          <StatusTile
            icon="fa-database"
            iconClass="text-info"
            title="Redis"
            ok={redisOk}
            statusLabel={
              !panel?.redis?.configured
                ? t("admin.statusNotConfigured")
                : !panel.redis.enabled
                  ? t("common.disabled")
                  : panel.redis.connected
                    ? t("admin.statusConnected")
                    : t("common.error")
            }
            rows={[
              {
                label: "URL",
                value: panel?.redis?.urlMasked ?? "—",
                mono: true,
              },
              {
                label: t("admin.statusLatency"),
                value: panel?.redis?.latencyMs != null ? `${panel.redis.latencyMs} ms` : "—",
              },
              {
                label: t("admin.statusSessions"),
                value: panel?.redis?.sessionStore ?? "—",
              },
              {
                label: t("admin.statusRateLimits"),
                value: panel?.redis?.rateLimitStore ?? "—",
              },
            ]}
          />
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-network-wired" aria-hidden />
          {t("admin.statusGameLayer")}
        </h2>
        <div className="status-chip-grid">
          <SummaryChip
            icon="fa-microchip"
            label={t("admin.statusDaemons")}
            value={`${nodesOnline} / ${nodesTotal} ${t("common.online").toLowerCase()}`}
            ok={nodesOnline === nodesTotal && nodesTotal > 0}
          />
          <SummaryChip
            icon="fa-cube"
            label={t("admin.statusMcServers")}
            value={`${gameRunning} / ${gameContainers} ${t("admin.statusRunning")}`}
            ok={gameContainers === 0 || gameRunning === gameContainers}
          />
          <SummaryChip
            icon="fa-database"
            label="MySQL"
            value={mysqlOk ? t("admin.statusAllOk") : t("admin.statusIssues")}
            ok={mysqlOk}
          />
          <SummaryChip
            icon="fa-network-wired"
            label="SFTP"
            value={sftpOk ? t("admin.statusAllOk") : t("admin.statusIssues")}
            ok={sftpOk}
          />
        </div>
        {data.nodes.length > 0 ? (
          <div className="status-node-mini mt-3">
            {data.nodes.map((n) => (
              <div key={n.id} className="status-node-mini__row">
                <HealthDot ok={n.reachable} />
                <span className="fw-semibold">{n.name}</span>
                <span className="badge bg-secondary">{n.isLocal ? "Local" : "Remote"}</span>
                <span className="small text-secondary font-monospace text-truncate ms-auto">
                  {n.publicUrl}
                </span>
                {n.mysql ? (
                  <span className="small text-secondary">MySQL {n.mysql.running ? "✓" : "✗"}</span>
                ) : null}
                {n.sftp ? (
                  <span className="small text-secondary text-truncate">
                    SFTP{" "}
                    {n.reachable && n.sftp.listening
                      ? n.sftp.hostname
                        ? `${n.sftp.hostname}:${n.sftp.port}`
                        : `:${n.sftp.port}`
                      : "—"}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
