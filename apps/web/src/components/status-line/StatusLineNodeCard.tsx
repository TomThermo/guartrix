import type { StatusContainer, StatusNode } from "@msm/shared";
import { Alert, Badge, Card, Col, Row, Table } from "react-bootstrap";
import { t as translate } from "../../i18n";
import { formatGb, statusVariant } from "../../utils";
import {
  CopyableIp,
  HealthDot,
  MiniBar,
  RoleBadge,
} from "./StatusLineUi";
import {
  containerStateVariant,
  formatUptime,
  loadAvgVariant,
} from "./status-line-utils";

function ContainerRow({ container }: { container: StatusContainer }) {
  const running = container.state.toLowerCase() === "running";
  const noContainer = container.id.startsWith("panel-");
  return (
    <tr className={noContainer ? "table-secondary" : undefined}>
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
        {noContainer ? (
          <span className="text-secondary">no container</span>
        ) : (
          container.name
        )}
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

export function StatusLineNodeCard({ node }: { node: StatusNode }) {
  const daemon = node.daemon;
  const allIps = [
    ...(daemon?.publicIp ? [{ iface: "public", address: daemon.publicIp }] : []),
    ...(daemon?.localIps ?? []),
  ];
  const gameContainers = node.containers.filter((c) => !c.isMysql);
  const mysqlContainers = node.containers.filter((c) => c.isMysql);

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <Card.Title className="h5 mb-1 d-flex flex-wrap align-items-center gap-2">
              <HealthDot ok={node.reachable} />
              <span>{node.name}</span>
              <RoleBadge>Daemon</RoleBadge>
              {node.isLocal ? (
                <Badge bg="secondary">Local (panel host)</Badge>
              ) : (
                <Badge bg="dark">Remote node</Badge>
              )}
            </Card.Title>
            <div className="small text-secondary mb-1">
              Game node: manages Docker, Minecraft containers, firewall, and MySQL on this machine.
            </div>
            <div className="small text-secondary">
              Daemon-API: <span className="font-monospace">{node.publicUrl}</span>
            </div>
          </div>
          <Badge bg={node.reachable ? "success" : "danger"} className="fs-6">
            {node.reachable ? "Online" : "Offline"}
          </Badge>
        </div>

        {!node.reachable && (
          <Alert variant="danger" className="small mb-3">
            {node.error ?? "daemon unreachable from the panel"}
          </Alert>
        )}

        {daemon && (
          <>
            <div className="p-3 rounded bg-body-tertiary mb-3">
              <div className="small text-secondary mb-2">
                <i className="fa-solid fa-globe me-1" />
                IP addresses on this game node
              </div>
              <div className="d-flex flex-wrap gap-3">
                {allIps.length > 0 ? (
                  allIps.map((ip, i) => (
                    <div key={`${ip.iface}-${i}`}>
                      <div className="small text-secondary text-uppercase">{ip.iface}</div>
                      <div className="fs-5 fw-semibold">
                        <CopyableIp ip={ip.address} />
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-secondary">Unknown</span>
                )}
              </div>
            </div>

            <div className="d-flex align-items-center gap-2 mb-3 p-2 rounded bg-body-tertiary small">
              <i className="fa-solid fa-microchip text-secondary" />
              <span>
                <strong>Daemon process</strong> ({daemon.hostname}) · port{" "}
                <span className="font-monospace">{daemon.daemonPort}</span> · pid{" "}
                <span className="font-monospace">{daemon.daemonPid}</span> · v
                {daemon.daemonVersion}
              </span>
            </div>

            <Row className="g-3 mb-3">
              <Col xs={6} md={3}>
                <div className="small text-secondary">Hostname</div>
                <div className="fw-semibold text-truncate">{daemon.hostname}</div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">OS / arch</div>
                <div className="fw-semibold text-truncate">
                  {daemon.osVersion} ({daemon.arch})
                </div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">Daemon uptime</div>
                <div className="fw-semibold">{formatUptime(daemon.uptime)}</div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">Daemon RAM (RSS)</div>
                <div className="fw-semibold">{daemon.daemonMemoryRssMb} MB</div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">CPU cores</div>
                <div className="fw-semibold">{daemon.cpuCount}</div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">Load average</div>
                <div className="fw-semibold">
                  <Badge bg={loadAvgVariant(daemon.loadAvg[0], daemon.cpuCount)} className="me-1">
                    {daemon.loadAvg[0].toFixed(2)}
                  </Badge>
                  <span className="text-secondary small">
                    {daemon.loadAvg[1].toFixed(2)} / {daemon.loadAvg[2].toFixed(2)}
                  </span>
                </div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">RAM host</div>
                <div className="fw-semibold d-flex align-items-center gap-2">
                  <MiniBar
                    percent={
                      daemon.totalMemoryMb > 0
                        ? ((daemon.totalMemoryMb - daemon.freeMemoryMb) / daemon.totalMemoryMb) *
                          100
                        : 0
                    }
                  />
                  {formatGb(daemon.totalMemoryMb - daemon.freeMemoryMb)} /{" "}
                  {formatGb(daemon.totalMemoryMb)}
                </div>
              </Col>
              <Col xs={6} md={3}>
                <div className="small text-secondary">Docker engine</div>
                <div className="fw-semibold">{daemon.dockerVersion}</div>
              </Col>
              <Col xs={12} md={6}>
                <div className="small text-secondary">Disk space</div>
                {daemon.disk ? (
                  <div className="fw-semibold d-flex align-items-center gap-2">
                    <MiniBar percent={daemon.disk.usedPercent} width={100} />
                    {daemon.disk.usedLabel} / {daemon.disk.totalLabel}
                    <span className="text-secondary small">
                      ({daemon.disk.usedPercent.toFixed(1)}%, {daemon.disk.freeLabel} free)
                    </span>
                  </div>
                ) : (
                  <span className="text-secondary">—</span>
                )}
              </Col>
            </Row>
          </>
        )}

        {node.mysql &&
          (() => {
            const mysqlContainer = mysqlContainers[0];
            return (
              <div className="d-flex align-items-center gap-2 mb-3 p-2 rounded bg-body-tertiary flex-wrap">
                <HealthDot ok={node.mysql!.running} />
                <RoleBadge>Database on this node</RoleBadge>
                <i className="fa-solid fa-database text-secondary" />
                <span className="fw-semibold">MySQL</span>
                <Badge bg={node.mysql!.running ? "success" : "danger"}>
                  {node.mysql!.running ? "Running" : "Down"}
                </Badge>
                {mysqlContainer && node.mysql!.running && (
                  <>
                    <span className="small d-flex align-items-center gap-1">
                      CPU <MiniBar percent={mysqlContainer.cpuPercent} />
                      {mysqlContainer.cpuPercent.toFixed(1)}%
                    </span>
                    <span className="small d-flex align-items-center gap-1">
                      RAM <MiniBar percent={mysqlContainer.memoryPercent} />
                      {mysqlContainer.memoryUsedLabel} / {mysqlContainer.memoryLimitLabel}
                    </span>
                  </>
                )}
                <span className="small text-secondary font-monospace ms-auto">
                  {node.mysql!.host}:{node.mysql!.port} · {node.mysql!.image}
                </span>
              </div>
            );
          })()}

        {node.sftp && (
          <div className="d-flex align-items-center gap-2 mb-3 p-2 rounded bg-body-tertiary flex-wrap">
            <HealthDot ok={node.reachable && node.sftp.listening} />
            <RoleBadge>SFTP on this node</RoleBadge>
            <i className="fa-solid fa-network-wired text-secondary" />
            <span className="fw-semibold">SFTP</span>
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
                : `port ${node.sftp.port}`}
            </span>
          </div>
        )}

        {node.containers.length > 0 ? (
          <>
            <div className="small text-secondary mb-2">
              <i className="fa-solid fa-cubes me-1" />
              Servers on this node ({gameContainers.length} Minecraft
              {mysqlContainers.length ? ` · ${mysqlContainers.length} database` : ""})
              <span className="ms-1">
                — stopped servers stay visible (container is removed on stop)
              </span>
            </div>
            <div className="table-responsive">
              <Table size="sm" hover className="mb-0 align-middle">
                <thead>
                  <tr className="small text-secondary">
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
      </Card.Body>
    </Card>
  );
}
