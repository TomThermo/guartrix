import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminStatusResponse, StatusContainer, StatusNode } from "@msm/shared";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card, Col, Row, Spinner, Table } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { SystemLogsPanel } from "../components/SystemLogsPanel";
import { copyText, formatGb, statusVariant } from "../utils";

const REFRESH_MS = 10_000;

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`d-inline-block rounded-circle me-2 ${ok ? "bg-success" : "bg-danger"}`}
      style={{ width: "0.6rem", height: "0.6rem", flex: "0 0 auto" }}
    />
  );
}

function CopyableIp({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-link p-0 text-decoration-none font-monospace"
      title="Copy IP"
      onClick={() => {
        void copyText(ip).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {ip} <i className={`fa-solid ${copied ? "fa-check text-success" : "fa-copy"} ms-1 small`} />
    </button>
  );
}

function containerStateVariant(state: string): "success" | "danger" | "secondary" | "warning" {
  const s = state.toLowerCase();
  if (s === "running") return "success";
  if (s === "restarting") return "warning";
  if (s === "exited" || s === "dead") return "danger";
  return "secondary";
}

function loadAvgVariant(load1: number, cpuCount: number): "success" | "warning" | "danger" {
  const ratio = cpuCount > 0 ? load1 / cpuCount : 0;
  if (ratio >= 1) return "danger";
  if (ratio >= 0.7) return "warning";
  return "success";
}

function percentVariant(pct: number): "success" | "warning" | "danger" {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "success";
}

function MiniBar({ percent, width = 64 }: { percent: number; width?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="progress d-inline-block align-middle"
      style={{ width, height: "0.4rem" }}
      title={`${clamped.toFixed(1)}%`}
    >
      <div className={`progress-bar bg-${percentVariant(clamped)}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function RoleBadge({ children }: { children: string }) {
  return (
    <Badge bg="light" text="dark" className="border fw-normal">
      {children}
    </Badge>
  );
}

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

function NodeCard({ node }: { node: StatusNode }) {
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
              Game node: manages Docker, Minecraft containers, firewall, and
              MySQL on this machine.
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
            <div className="text-secondary small">No containers on this node.</div>
          )
        )}
      </Card.Body>
    </Card>
  );
}

export function StatusLinePage() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api.getAdminStatus();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    timerRef.current = setInterval(() => void refresh(false), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  const panel = data?.panel;
  const apiInfo = panel?.api ?? data?.api;
  const nodesOnline = data?.nodes.filter((n) => n.reachable).length ?? 0;
  const nodesTotal = data?.nodes.length ?? 0;
  const gameContainers =
    data?.nodes.reduce(
      (sum, n) => sum + n.containers.filter((c) => !c.isMysql).length,
      0,
    ) ?? 0;
  const gameRunning =
    data?.nodes.reduce(
      (sum, n) =>
        sum +
        n.containers.filter((c) => !c.isMysql && c.state.toLowerCase() === "running").length,
      0,
    ) ?? 0;

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">{t("admin.statusTitle")}</h1>
          <p className="text-secondary mb-0 small">
            {t("admin.statusSubtitle")} Refreshes every {Math.round(REFRESH_MS / 1000)}s.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {data && (
            <div className="small text-secondary">
              Updated {new Date(data.generatedAt).toLocaleTimeString()}
            </div>
          )}
          <Button size="sm" variant="outline-secondary" onClick={() => void refresh(true)}>
            <i className="fa-solid fa-rotate me-1" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="mb-4">
        <Card.Body className="py-3">
          <div className="small text-secondary text-uppercase mb-2">Architecture</div>
          <div className="d-flex flex-wrap align-items-center gap-2 small">
            <span className="badge text-bg-primary">
              <i className="fa-solid fa-globe me-1" />
              Webserver
            </span>
            <span className="text-secondary">→</span>
            <span className="badge text-bg-dark">
              <i className="fa-solid fa-server me-1" />
              API-server
            </span>
            <span className="text-secondary">→</span>
            <span className="badge text-bg-warning text-dark">
              <i className="fa-solid fa-microchip me-1" />
              Daemon
            </span>
            <span className="text-secondary">→</span>
            <span className="badge text-bg-success">
              <i className="fa-solid fa-cube me-1" />
              Minecraft (Docker)
            </span>
          </div>
          <p className="small text-secondary mb-0 mt-2">
            <strong>Web + API</strong> = Panel · <strong>Daemon per node</strong> · <strong>Containers</strong> = game servers.
          </p>
        </Card.Body>
      </Card>

      {panel?.version && (
        <Card
          className={`mb-4 ${
            panel.version.belowMinimum
              ? "border-danger"
              : panel.version.updateAvailable
                ? "border-warning"
                : "border-success"
          }`}
        >
          <Card.Body className="py-3">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
              <div>
                <div className="small text-secondary text-uppercase mb-1">
                  System version
                </div>
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className="fw-semibold font-monospace">
                    v{panel.version.current}
                  </span>
                  {panel.version.upToDate && !panel.version.belowMinimum ? (
                    <Badge bg="success">{t("common.upToDate")}</Badge>
                  ) : panel.version.belowMinimum ? (
                    <Badge bg="danger">Below minimum</Badge>
                  ) : panel.version.updateAvailable ? (
                    <Badge bg="warning" text="dark">
                      Update available
                    </Badge>
                  ) : (
                    <Badge bg="secondary">Channel unknown</Badge>
                  )}
                  {panel.version.source === "unreachable" && (
                    <span className="small text-secondary">
                      (license server unreachable)
                    </span>
                  )}
                </div>
                {panel.version.latest && (
                  <p className="small text-secondary mb-0 mt-2">
                    Latest channel:{" "}
                    <span className="font-monospace">v{panel.version.latest}</span>
                    {panel.version.minVersion
                      ? ` · minimum v${panel.version.minVersion}`
                      : ""}
                  </p>
                )}
                {panel.version.notes && (
                  <p className="small mb-0 mt-1">{panel.version.notes}</p>
                )}
              </div>
              <Link className="btn btn-sm btn-outline-secondary" to="/admin/license">
                License settings
              </Link>
            </div>
          </Card.Body>
        </Card>
      )}

      <div className="small text-secondary text-uppercase mb-2">Panel (control plane)</div>
      <Row className="g-3 mb-4">
        <Col xs={12} md={4}>
          <Card className="h-100 border-primary">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-globe text-primary" />
                Webserver
                <RoleBadge>Panel UI</RoleBadge>
              </Card.Title>
              <p className="small text-secondary mb-3">
                Serves the website / dashboard (prod-web). Players and admins land here.
              </p>
              {panel?.web ? (
                <>
                  <div className="d-flex align-items-center mb-2">
                    <HealthDot ok={panel.web.ok} />
                    <span className="fw-semibold">
                      {panel.web.ok ? "Online" : "Offline / unknown"}
                    </span>
                  </div>
                  <dl className="row small mb-0">
                    <dt className="col-5 text-secondary">URL</dt>
                    <dd className="col-7 font-monospace text-break">{panel.web.url}</dd>
                    <dt className="col-5 text-secondary">HTTP port</dt>
                    <dd className="col-7">{panel.web.httpPort}</dd>
                    <dt className="col-5 text-secondary">HTTPS port</dt>
                    <dd className="col-7">{panel.web.httpsPort ?? "off"}</dd>
                    <dt className="col-5 text-secondary">PID</dt>
                    <dd className="col-7">{panel.web.pid ?? "—"}</dd>
                  </dl>
                </>
              ) : (
                <div className="small text-secondary">No web status available.</div>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="h-100 border-dark">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-server" />
                API-server
                <RoleBadge>Panel backend</RoleBadge>
              </Card.Title>
              <p className="small text-secondary mb-3">
                Auth, database, create servers, and forward commands to the correct daemon.
              </p>
              {apiInfo && (
                <>
                  <div className="d-flex align-items-center mb-2">
                    <HealthDot ok={Boolean(apiInfo.ok)} />
                    <span className="fw-semibold">Online</span>
                  </div>
                  <dl className="row small mb-0">
                    <dt className="col-5 text-secondary">Port</dt>
                    <dd className="col-7">{panel?.api?.port ?? "—"}</dd>
                    <dt className="col-5 text-secondary">Uptime</dt>
                    <dd className="col-7">{formatUptime(apiInfo.uptime)}</dd>
                    <dt className="col-5 text-secondary">Memory</dt>
                    <dd className="col-7">{apiInfo.memoryRssMb} MB</dd>
                    <dt className="col-5 text-secondary">PID</dt>
                    <dd className="col-7">{apiInfo.pid}</dd>
                    <dt className="col-5 text-secondary">Node.js</dt>
                    <dd className="col-7">{apiInfo.nodeVersion}</dd>
                  </dl>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-heart-pulse text-danger" />
                Watchdog
                <RoleBadge>Monitor</RoleBadge>
              </Card.Title>
              <p className="small text-secondary mb-3">
                Watches web, API, and the local daemon and restarts them on failure.
              </p>
              {panel?.watchdog ? (
                <>
                  <div className="d-flex align-items-center mb-2">
                    <HealthDot ok={panel.watchdog.ok} />
                    <span className="fw-semibold">
                      {panel.watchdog.ok ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <dl className="row small mb-0">
                    <dt className="col-5 text-secondary">PID</dt>
                    <dd className="col-7">{panel.watchdog.pid ?? "—"}</dd>
                  </dl>
                </>
              ) : (
                <div className="small text-secondary">No watchdog status.</div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="small text-secondary text-uppercase mb-2">Game nodes</div>
      <Row className="g-3 mb-4">
        <Col xs={12} md={6} xl={3}>
          <Card className="h-100 border-warning">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-microchip text-warning" />
                Daemons
              </Card.Title>
              <p className="small text-secondary mb-3">
                One daemon per physical server. Manages Docker on that machine.
              </p>
              <div className="d-flex align-items-center mb-2">
                <HealthDot ok={nodesOnline === nodesTotal && nodesTotal > 0} />
                <span className="fw-semibold">
                  {nodesOnline} / {nodesTotal} online
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card className="h-100 border-success">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-cube text-success" />
                Minecraft servers
              </Card.Title>
              <p className="small text-secondary mb-3">
                Docker containers with game servers, across all nodes.
              </p>
              <div className="d-flex align-items-center mb-2">
                <HealthDot ok={gameRunning === gameContainers && gameContainers > 0} />
                <span className="fw-semibold">
                  {gameRunning} / {gameContainers} running
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-database" />
                MySQL per node
              </Card.Title>
              <p className="small text-secondary mb-3">
                Database container belonging to that node (not the panel itself).
              </p>
              {data?.nodes.map((n) =>
                n.mysql ? (
                  <div key={n.id} className="d-flex align-items-center mb-1">
                    <HealthDot ok={n.mysql.running} />
                    <span className="small">
                      {n.name}: {n.mysql.running ? "Running" : "Down"}
                    </span>
                  </div>
                ) : (
                  <div key={n.id} className="small text-secondary mb-1">
                    {n.name}: no data
                  </div>
                ),
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={6} xl={3}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-network-wired" />
                SFTP per node
              </Card.Title>
              <p className="small text-secondary mb-3">
                File transfer endpoint on each node (port 2022 by default).
              </p>
              {data?.nodes.map((n) =>
                n.sftp ? (
                  <div key={n.id} className="d-flex align-items-center mb-1">
                    <HealthDot ok={n.reachable && n.sftp.listening} />
                    <span className="small text-truncate">
                      {n.name}:{" "}
                      {n.reachable && n.sftp.listening
                        ? n.sftp.hostname
                          ? `${n.sftp.hostname}:${n.sftp.port}`
                          : `Listening :${n.sftp.port}`
                        : n.reachable
                          ? "Stopped"
                          : "Unreachable"}
                    </span>
                  </div>
                ) : (
                  <div key={n.id} className="small text-secondary mb-1">
                    {n.name}: no data
                  </div>
                ),
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="small text-secondary text-uppercase mb-2">Per node</div>
      <Row className="g-3">
        {data?.nodes.map((node) => (
          <Col key={node.id} xs={12}>
            <NodeCard node={node} />
          </Col>
        ))}
      </Row>

      {data && <SystemLogsPanel nodes={data.nodes} />}
    </div>
  );
}
