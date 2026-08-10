import type { ReactNode } from "react";
import type { StatusContainer, StatusNode } from "@guartrix/shared";
import { Alert, Badge, Table } from "react-bootstrap";
import { t as translate } from "../../i18n";
import { formatGb, statusVariant } from "../../utils";
import { CopyableIp, HealthDot, MiniBar } from "./StatusLineUi";
import { containerStateVariant, formatUptime, loadAvgVariant } from "./status-line-utils";

function ContainerRow({ container }: { container: StatusContainer }) {
  const running = container.state.toLowerCase() === "running";
  const noContainer = container.id.startsWith("panel-");
  return (
    <tr className={noContainer ? "status-containers-table__muted" : undefined}>
      <td>
        {container.isMysql ? (
          <span>
            <Badge bg="info" className="me-2">
              Database
            </Badge>
            MySQL
          </span>
        ) : (
          <span>
            <Badge bg="primary" className="me-2">
              Minecraft
            </Badge>
            {container.serverName ?? (
              <span className="text-secondary font-monospace">{container.serverId ?? "?"}</span>
            )}
          </span>
        )}
      </td>
      <td className="font-monospace small text-secondary">
        {noContainer ? <span className="text-secondary">no container</span> : container.name}
      </td>
      <td className="font-monospace small text-secondary">
        {noContainer ? "—" : container.id.slice(0, 12)}
      </td>
      <td className="small text-secondary">{noContainer ? "—" : container.image}</td>
      <td className="small text-secondary font-monospace">{container.ports || "—"}</td>
      <td>
        <Badge bg={containerStateVariant(container.state)}>
          {noContainer ? "Removed" : container.status}
        </Badge>
      </td>
      <td>
        {container.serverStatus ? (
          <Badge bg={statusVariant(container.serverStatus)}>{container.serverStatus}</Badge>
        ) : (
          <span className="text-secondary">—</span>
        )}
      </td>
      <td className="small">
        {running ? (
          <span className="d-flex align-items-center gap-2">
            <MiniBar percent={container.cpuPercent} />
            {container.cpuPercent.toFixed(1)}%
          </span>
        ) : (
          <span className="text-secondary">—</span>
        )}
      </td>
      <td className="small">
        {running ? (
          <span className="d-flex align-items-center gap-2">
            <MiniBar percent={container.memoryPercent} />
            <span className="text-nowrap">
              {container.memoryUsedLabel} / {container.memoryLimitLabel}
            </span>
          </span>
        ) : (
          <span className="text-secondary">—</span>
        )}
      </td>
    </tr>
  );
}

function MetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="node-meta-tile">
      <div className="node-meta-tile__label">{label}</div>
      <div className="node-meta-tile__value">{children}</div>
    </div>
  );
}

export function StatusLineNodeCard({ node }: { node: StatusNode }) {
  const daemon = node.daemon;
  const allIps = [
    ...(daemon?.publicIp ? [{ iface: "public", address: daemon.publicIp }] : []),
    ...(daemon?.localIps ?? []),
  ];
  const gameContainers = node.containers.filter((c) => !c.isMysql);
  const mysqlContainers = node.containers.filter((c) => c.isMysql);

  return (
    <section className="admin-inset-card status-node-card">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="admin-section-title mb-1">
            <HealthDot ok={node.reachable} />
            <i className="fa-solid fa-microchip" aria-hidden />
            {node.name}
            <Badge bg="secondary" className="ms-1 fw-normal">
              {node.isLocal ? "Local" : "Remote"}
            </Badge>
          </h2>
          <div className="small text-secondary font-monospace text-truncate">{node.publicUrl}</div>
        </div>
        <Badge bg={node.reachable ? "success" : "danger"} className="fs-6">
          {node.reachable ? "Online" : "Offline"}
        </Badge>
      </div>

      {!node.reachable && (
        <Alert variant="danger" className="small mb-3 py-2">
          {node.error ?? "daemon unreachable from the panel"}
        </Alert>
      )}

      {daemon && (
        <>
          <div className="status-node-ips mb-3">
            <div className="small text-secondary mb-2">
              <i className="fa-solid fa-globe me-1" aria-hidden />
              IP addresses
            </div>
            <div className="d-flex flex-wrap gap-2">
              {allIps.length > 0 ? (
                allIps.map((ip, i) => (
                  <div key={`${ip.iface}-${i}`} className="status-ip-chip">
                    <span className="status-ip-chip__iface">{ip.iface}</span>
                    <CopyableIp ip={ip.address} />
                  </div>
                ))
              ) : (
                <span className="text-secondary small">Unknown</span>
              )}
            </div>
          </div>

          <div className="node-info-tiles mb-3">
            <MetaCell label="Hostname">{daemon.hostname}</MetaCell>
            <MetaCell label="OS / arch">
              {daemon.osVersion} ({daemon.arch})
            </MetaCell>
            <MetaCell label="Uptime">{formatUptime(daemon.uptime)}</MetaCell>
            <MetaCell label="Daemon RAM">{daemon.daemonMemoryRssMb} MB</MetaCell>
            <MetaCell label="CPU cores">{daemon.cpuCount}</MetaCell>
            <MetaCell label="Load">
              <Badge bg={loadAvgVariant(daemon.loadAvg[0], daemon.cpuCount)} className="me-1">
                {daemon.loadAvg[0].toFixed(2)}
              </Badge>
              <span className="text-secondary small">
                {daemon.loadAvg[1].toFixed(2)} / {daemon.loadAvg[2].toFixed(2)}
              </span>
            </MetaCell>
            <MetaCell label="RAM host">
              <span className="d-flex align-items-center gap-2 flex-wrap">
                <MiniBar
                  percent={
                    daemon.totalMemoryMb > 0
                      ? ((daemon.totalMemoryMb - daemon.freeMemoryMb) / daemon.totalMemoryMb) * 100
                      : 0
                  }
                />
                {formatGb(daemon.totalMemoryMb - daemon.freeMemoryMb)} /{" "}
                {formatGb(daemon.totalMemoryMb)}
              </span>
            </MetaCell>
            <MetaCell label="Docker">{daemon.dockerVersion}</MetaCell>
            <MetaCell label="Daemon">
              :{daemon.daemonPort} · pid {daemon.daemonPid} · v{daemon.daemonVersion}
            </MetaCell>
            <div className="node-meta-tile node-meta-tile--wide">
              <div className="node-meta-tile__label">Disk</div>
              <div className="node-meta-tile__value">
                {daemon.disk ? (
                  <span className="d-flex align-items-center gap-2 flex-wrap">
                    <MiniBar percent={daemon.disk.usedPercent} width={100} />
                    {daemon.disk.usedLabel} / {daemon.disk.totalLabel}
                    <span className="node-meta-tile__hint">
                      {daemon.disk.usedPercent.toFixed(1)}% · {daemon.disk.freeLabel} free
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="status-service-row mb-3">
        {node.mysql ? (
          <div className="status-service-pill">
            <HealthDot ok={node.mysql.running} />
            <i className="fa-solid fa-database" aria-hidden />
            <strong>MySQL</strong>
            <Badge bg={node.mysql.running ? "success" : "danger"}>
              {node.mysql.running ? "Running" : "Down"}
            </Badge>
            {mysqlContainers[0] && node.mysql.running ? (
              <span className="small d-flex align-items-center gap-1">
                <MiniBar percent={mysqlContainers[0].cpuPercent} />
                {mysqlContainers[0].cpuPercent.toFixed(0)}%
              </span>
            ) : null}
            <span className="small text-secondary font-monospace ms-auto">
              {node.mysql.host}:{node.mysql.port}
            </span>
          </div>
        ) : null}
        {node.sftp ? (
          <div className="status-service-pill">
            <HealthDot ok={node.reachable && node.sftp.listening} />
            <i className="fa-solid fa-network-wired" aria-hidden />
            <strong>SFTP</strong>
            <Badge
              bg={
                node.reachable && node.sftp.listening
                  ? "success"
                  : node.reachable
                    ? "warning"
                    : "danger"
              }
            >
              {node.reachable && node.sftp.listening
                ? "Listening"
                : node.reachable
                  ? "Stopped"
                  : "Unreachable"}
            </Badge>
            <span className="small text-secondary font-monospace ms-auto">
              {node.sftp.hostname
                ? `${node.sftp.hostname}:${node.sftp.port}`
                : `:${node.sftp.port}`}
            </span>
          </div>
        ) : null}
      </div>

      {node.containers.length > 0 ? (
        <>
          <div className="small text-secondary mb-2">
            <i className="fa-solid fa-cubes me-1" aria-hidden />
            Servers ({gameContainers.length} Minecraft
            {mysqlContainers.length ? ` · ${mysqlContainers.length} DB` : ""})
          </div>
          <div className="table-responsive">
            <Table size="sm" hover className="mb-0 align-middle status-containers-table">
              <thead>
                <tr>
                  <th>Type / server</th>
                  <th>Container</th>
                  <th>ID</th>
                  <th>Image</th>
                  <th>Ports</th>
                  <th>Docker</th>
                  <th>Panel</th>
                  <th>CPU</th>
                  <th>RAM</th>
                </tr>
              </thead>
              <tbody>
                {node.containers.map((c) => (
                  <ContainerRow key={c.id} container={c} />
                ))}
              </tbody>
            </Table>
          </div>
        </>
      ) : (
        node.reachable && (
          <div className="text-secondary small">{translate("admin.noContainers")}</div>
        )
      )}
    </section>
  );
}
