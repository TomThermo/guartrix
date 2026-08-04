import type { AdminStatusResponse } from "@msm/shared";
import { Link } from "react-router-dom";
import { Badge, Card, Col, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { HealthDot, RoleBadge } from "./StatusLineUi";
import { formatUptime } from "./status-line-utils";

type Panel = NonNullable<AdminStatusResponse["panel"]>;
type ApiInfo = NonNullable<Panel["api"]>;

export function StatusLineArchitectureCard() {
  return (
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
          <strong>Web + API</strong> = Panel · <strong>Daemon per node</strong> ·{" "}
          <strong>Containers</strong> = game servers.
        </p>
      </Card.Body>
    </Card>
  );
}

export function StatusLineVersionCard({ version }: { version: NonNullable<Panel["version"]> }) {
  const { t } = useI18n();
  return (
    <Card
      className={`mb-4 ${
        version.belowMinimum
          ? "border-danger"
          : version.updateAvailable
            ? "border-warning"
            : "border-success"
      }`}
    >
      <Card.Body className="py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <div className="small text-secondary text-uppercase mb-1">System version</div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="fw-semibold font-monospace">v{version.current}</span>
              {version.upToDate && !version.belowMinimum ? (
                <Badge bg="success">{t("common.upToDate")}</Badge>
              ) : version.belowMinimum ? (
                <Badge bg="danger">Below minimum</Badge>
              ) : version.updateAvailable ? (
                <Badge bg="warning" text="dark">
                  Update available
                </Badge>
              ) : (
                <Badge bg="secondary">Channel unknown</Badge>
              )}
              {version.source === "unreachable" && (
                <span className="small text-secondary">(license server unreachable)</span>
              )}
            </div>
            {version.latest && (
              <p className="small text-secondary mb-0 mt-2">
                Latest channel: <span className="font-monospace">v{version.latest}</span>
                {version.minVersion ? ` · minimum v${version.minVersion}` : ""}
              </p>
            )}
            {version.notes && <p className="small mb-0 mt-1">{version.notes}</p>}
          </div>
          <Link className="btn btn-sm btn-outline-secondary" to="/admin/license">
            License settings
          </Link>
        </div>
      </Card.Body>
    </Card>
  );
}

export function StatusLinePanelCards({
  panel,
  apiInfo,
}: {
  panel: Panel | undefined;
  apiInfo: ApiInfo | undefined;
}) {
  return (
    <>
      <div className="small text-secondary text-uppercase mb-2">Panel (control plane)</div>
      <Row className="g-3 mb-4">
        <Col xs={12} md={6} xl={3}>
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
        <Col xs={12} md={6} xl={3}>
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
        <Col xs={12} md={6} xl={3}>
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
        <Col xs={12} md={6} xl={3}>
          <Card className="h-100 border-info">
            <Card.Body>
              <Card.Title className="h6 mb-1 d-flex align-items-center gap-2">
                <i className="fa-solid fa-database text-info" />
                Redis
                <RoleBadge>HA store</RoleBadge>
              </Card.Title>
              <p className="small text-secondary mb-3">
                Optional shared store for multi-API sessions, rate limits, transfers, and events.
              </p>
              {panel?.redis ? (
                <>
                  <div className="d-flex align-items-center mb-2">
                    <HealthDot
                      ok={!panel.redis.enabled ? true : panel.redis.connected}
                    />
                    <span className="fw-semibold">
                      {!panel.redis.configured
                        ? "Not configured"
                        : !panel.redis.enabled
                          ? "Disabled"
                          : panel.redis.connected
                            ? "Connected"
                            : "Error"}
                    </span>
                  </div>
                  <dl className="row small mb-0">
                    <dt className="col-5 text-secondary">URL</dt>
                    <dd className="col-7 font-monospace text-break">
                      {panel.redis.urlMasked ?? "—"}
                    </dd>
                    <dt className="col-5 text-secondary">Latency</dt>
                    <dd className="col-7">
                      {panel.redis.latencyMs != null ? `${panel.redis.latencyMs} ms` : "—"}
                    </dd>
                    <dt className="col-5 text-secondary">Sessions</dt>
                    <dd className="col-7">{panel.redis.sessionStore}</dd>
                    <dt className="col-5 text-secondary">Rate limits</dt>
                    <dd className="col-7">{panel.redis.rateLimitStore}</dd>
                    {panel.redis.error && (
                      <>
                        <dt className="col-5 text-secondary">Error</dt>
                        <dd className="col-7 text-danger text-break">{panel.redis.error}</dd>
                      </>
                    )}
                  </dl>
                </>
              ) : (
                <div className="small text-secondary">No Redis status.</div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export function StatusLineGameNodeSummary({ data }: { data: AdminStatusResponse }) {
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

  return (
    <>
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
              {data.nodes.map((n) =>
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
              {data.nodes.map((n) =>
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
    </>
  );
}
