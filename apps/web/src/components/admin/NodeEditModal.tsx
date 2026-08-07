import { useEffect, useState } from "react";
import type { DaemonNode, NodeTestResult } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Form,
  Modal,
  Nav,
  Spinner,
  Stack,
  Tab,
} from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { copyText, formatGb } from "../../utils";
import { NodePortPoolPanel } from "../NodePortPoolPanel";
import { NodeLiveStats } from "./NodeLiveStats";

function statusVariant(
  status: DaemonNode["status"],
): "success" | "danger" | "secondary" {
  if (status === "ONLINE") return "success";
  if (status === "OFFLINE") return "danger";
  return "secondary";
}

/** Parse panel→daemon URL into scheme / host / port. */
export function parseDaemonPublicUrl(raw: string): {
  scheme: "http" | "https";
  fqdn: string;
  daemonPort: number;
} {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Daemon URL is required");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid daemon URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Daemon URL must be http:// or https://");
  }
  const fqdn = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!fqdn) throw new Error("Daemon URL needs a hostname or IP");
  const daemonPort =
    parsed.port !== ""
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 8081;
  if (!Number.isInteger(daemonPort) || daemonPort < 1 || daemonPort > 65535) {
    throw new Error("Invalid daemon port");
  }
  return {
    scheme: parsed.protocol === "https:" ? "https" : "http",
    fqdn,
    daemonPort,
  };
}

type TabId = "overview" | "settings" | "allocations";
type SslMode = "http" | "https" | "https-proxy";

function sslModeFromNode(node: DaemonNode): SslMode {
  if (node.scheme === "https" && node.behindProxy) return "https-proxy";
  if (node.scheme === "https") return "https";
  return "http";
}

function schemeFromSslMode(mode: SslMode): "http" | "https" {
  return mode === "http" ? "http" : "https";
}

interface Props {
  node: DaemonNode;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onInstall: (node: DaemonNode) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onNewToken: (token: string) => void;
}

export function NodeEditModal({
  node,
  busy,
  onBusy,
  onClose,
  onChanged,
  onInstall,
  onError,
  onNotice,
  onNewToken,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("overview");
  const [name, setName] = useState(node.name);
  const [fqdn, setFqdn] = useState(node.fqdn);
  const [daemonPort, setDaemonPort] = useState(String(node.daemonPort));
  const [sslMode, setSslMode] = useState<SslMode>(() => sslModeFromNode(node));
  const [location, setLocation] = useState(node.location ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [dnsAddresses, setDnsAddresses] = useState<string[]>([]);
  const [dnsOk, setDnsOk] = useState<boolean | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [panelSecure, setPanelSecure] = useState(
    () => window.location.protocol === "https:",
  );

  useEffect(() => {
    setName(node.name);
    setFqdn(node.fqdn);
    setDaemonPort(String(node.daemonPort));
    setSslMode(sslModeFromNode(node));
    setLocation(node.location ?? "");
    setLocalError(null);
    setLocalNotice(null);
  }, [node]);

  useEffect(() => {
    const host = fqdn.trim();
    if (!host || tab !== "settings") return;
    let cancelled = false;
    setDnsLoading(true);
    const timer = window.setTimeout(() => {
      void api
        .lookupDns(host)
        .then((res) => {
          if (cancelled) return;
          setDnsAddresses(res.addresses);
          setDnsOk(res.ok);
          setPanelSecure(res.panelSecure);
        })
        .catch(() => {
          if (cancelled) return;
          setDnsAddresses([]);
          setDnsOk(false);
        })
        .finally(() => {
          if (!cancelled) setDnsLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fqdn, tab]);

  const ramPct =
    node.memoryMb > 0
      ? Math.min(100, Math.round((node.memoryUsedMb / node.memoryMb) * 100))
      : 0;

  async function onTest() {
    onBusy(node.id);
    setLocalError(null);
    setLocalNotice(null);
    onError(null);
    try {
      const result = (await api.testNode(node.id)) as NodeTestResult & {
        node: DaemonNode;
      };
      await onChanged();
      if (result.ok) {
        const msg = `Connection OK — ${result.system?.hostname ?? "daemon"} · ${result.system?.daemonVersion ?? ""}`;
        setLocalNotice(msg);
        onNotice(msg);
      } else {
        const msg = result.error ?? "Test failed";
        setLocalError(msg);
        onError(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      onError(msg);
    } finally {
      onBusy(null);
    }
  }

  async function onRegenerate() {
    if (
      !confirm(
        "Generate a new token? The daemon must get DAEMON_TOKEN updated.",
      )
    ) {
      return;
    }
    onBusy(node.id);
    setLocalError(null);
    onError(null);
    try {
      const res = await api.regenerateNodeToken(node.id);
      onNewToken(res.token);
      const msg =
        "New token created — copy it now, or open Install again in the modal.";
      setLocalNotice(msg);
      onNotice(msg);
      await onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      onError(msg);
    } finally {
      onBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this node?")) return;
    onBusy(node.id);
    setLocalError(null);
    onError(null);
    try {
      await api.deleteNode(node.id);
      onNotice("Node deleted.");
      onClose();
      await onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      onError(msg);
    } finally {
      onBusy(null);
    }
  }

  async function onSaveSettings() {
    const trimmed = name.trim();
    const host = fqdn.trim();
    const port = Number(daemonPort);
    if (!trimmed) {
      setLocalError(t("admin.nodeNameRequired"));
      return;
    }
    if (!host) {
      setLocalError(t("admin.nodeDomainRequired"));
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setLocalError(t("admin.nodePortInvalid"));
      return;
    }
    onBusy(node.id);
    setLocalError(null);
    onError(null);
    try {
      await api.updateNode(node.id, {
        name: trimmed,
        fqdn: host,
        daemonPort: port,
        scheme: schemeFromSslMode(sslMode),
        behindProxy: sslMode === "https-proxy",
        location: location.trim() || null,
      });
      setLocalNotice(t("admin.nodeSaved"));
      onNotice(t("admin.nodeSaved"));
      await onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      onError(msg);
    } finally {
      onBusy(null);
    }
  }

  return (
    <Modal show fullscreen onHide={onClose} className="node-edit-modal">
      <Modal.Header closeButton className="border-bottom">
        <Modal.Title className="d-flex align-items-center gap-2 min-w-0">
          <i className="fa-solid fa-network-wired text-secondary" aria-hidden />
          <span className="text-truncate">
            {t("admin.editNodeTitle", { name: node.name })}
          </span>
          <Badge bg={statusVariant(node.status)} className="text-uppercase">
            {node.status}
          </Badge>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="pt-3">
        {(localError || localNotice) && (
          <div className="mb-3">
            {localError && (
              <Alert
                variant="danger"
                dismissible
                onClose={() => setLocalError(null)}
                className="py-2 mb-2"
              >
                {localError}
              </Alert>
            )}
            {localNotice && (
              <Alert
                variant="success"
                dismissible
                onClose={() => setLocalNotice(null)}
                className="py-2 mb-0"
              >
                {localNotice}
              </Alert>
            )}
          </div>
        )}

        <Tab.Container
          activeKey={tab}
          onSelect={(k) => setTab((k as TabId) || "overview")}
        >
          <Nav variant="pills" className="node-edit-tabs gap-1 mb-3 flex-wrap">
            <Nav.Item>
              <Nav.Link eventKey="overview">
                <i className="fa-solid fa-gauge-high me-1" aria-hidden />
                {t("admin.nodeTabOverview")}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="settings">
                <i className="fa-solid fa-sliders me-1" aria-hidden />
                {t("admin.nodeTabBasic")}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="allocations">
                <i className="fa-solid fa-ethernet me-1" aria-hidden />
                {t("admin.nodeTabAllocations")}
              </Nav.Link>
            </Nav.Item>
          </Nav>

          <Tab.Content>
            <Tab.Pane eventKey="overview">
              <div className="row g-3">
                <div className="col-lg-7">
                  <section className="admin-inset-card h-100">
                    <h2 className="admin-section-title mb-3">
                      <i className="fa-solid fa-circle-info" aria-hidden />
                      {t("admin.nodeInformation")}
                    </h2>
                    <dl className="admin-kv mb-3">
                      <dt>{t("admin.nodeType")}</dt>
                      <dd>{node.isLocal ? t("admin.nodeLocal") : t("admin.nodeRemote")}</dd>
                      <dt>{t("admin.nodeLocation")}</dt>
                      <dd>{node.location || "—"}</dd>
                      <dt>{t("admin.nodeAddress")}</dt>
                      <dd className="font-monospace small">{node.publicUrl}</dd>
                      <dt>{t("admin.nodeServers")}</dt>
                      <dd>{node.serverCount}</dd>
                      <dt>{t("admin.nodeRam")}</dt>
                      <dd>
                        {node.memoryMb > 0
                          ? `${formatGb(node.memoryUsedMb)} / ${formatGb(node.memoryMb)} (${ramPct}%) ${t("admin.nodeAllocated")}`
                          : "—"}
                      </dd>
                      <dt>{t("admin.nodeLastSeen")}</dt>
                      <dd>
                        {node.lastSeenAt
                          ? new Date(node.lastSeenAt).toLocaleString()
                          : "—"}
                      </dd>
                      <dt>SFTP</dt>
                      <dd className="font-monospace small">
                        {node.sftpHostname
                          ? `${node.sftpHostname}:${node.sftpPort}`
                          : "—"}
                      </dd>
                    </dl>
                    <hr className="border-secondary opacity-25 my-3" />
                    <h3 className="admin-section-title mb-3">
                      <i className="fa-solid fa-microchip" aria-hidden />
                      {t("admin.nodeLiveTitle")}
                    </h3>
                    <NodeLiveStats nodeId={node.id} active={tab === "overview"} />
                  </section>
                </div>
                <div className="col-lg-5">
                  <section className="admin-inset-card h-100">
                    <h2 className="admin-section-title mb-3">
                      <i className="fa-solid fa-gears" aria-hidden />
                      {t("admin.nodeActions")}
                    </h2>
                    <Stack gap={2}>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void onTest()}
                      >
                        {busy ? (
                          <Spinner size="sm" animation="border" />
                        ) : (
                          <>
                            <i className="fa-solid fa-heart-pulse me-2" aria-hidden />
                            {t("admin.testConnection")}
                          </>
                        )}
                      </Button>
                      {!node.isLocal && (
                        <Button
                          variant="outline-primary"
                          disabled={busy}
                          onClick={() => onInstall(node)}
                        >
                          <i className="fa-solid fa-download me-2" aria-hidden />
                          {t("admin.installDaemon")}
                        </Button>
                      )}
                      <Button
                        variant="outline-secondary"
                        disabled={busy}
                        onClick={() => void onRegenerate()}
                      >
                        <i className="fa-solid fa-key me-2" aria-hidden />
                        {t("admin.newToken")}
                      </Button>
                      {!node.isLocal && (
                        <Button
                          variant="outline-danger"
                          disabled={busy}
                          onClick={() => void onDelete()}
                        >
                          <i className="fa-solid fa-trash me-2" aria-hidden />
                          {t("common.delete")}
                        </Button>
                      )}
                    </Stack>
                  </section>
                </div>
              </div>
            </Tab.Pane>

            <Tab.Pane eventKey="settings">
              <section className="admin-inset-card" style={{ maxWidth: "40rem" }}>
                <h2 className="admin-section-title mb-3">
                  <i className="fa-solid fa-sliders" aria-hidden />
                  {t("admin.nodeTabBasic")}
                </h2>
                <Form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onSaveSettings();
                  }}
                >
                  <Form.Group className="mb-3">
                    <Form.Label>
                      {t("admin.nodeDisplayName")}{" "}
                      <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={64}
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>
                      {t("admin.nodeDomainName")}{" "}
                      <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      className="font-monospace"
                      value={fqdn}
                      onChange={(e) => setFqdn(e.target.value)}
                      placeholder="node.example.com"
                      required
                    />
                    <div className="small mt-1">
                      {dnsLoading ? (
                        <span className="text-secondary">
                          <Spinner size="sm" animation="border" className="me-1" />
                          {t("admin.nodeDnsChecking")}
                        </span>
                      ) : dnsOk === true && dnsAddresses[0] ? (
                        <span className="text-success">
                          <i className="fa-solid fa-circle-check me-1" aria-hidden />
                          {t("admin.nodeDnsValid", { ip: dnsAddresses[0] })}
                        </span>
                      ) : dnsOk === false ? (
                        <span className="text-warning">
                          <i
                            className="fa-solid fa-triangle-exclamation me-1"
                            aria-hidden
                          />
                          {t("admin.nodeDnsInvalid")}
                        </span>
                      ) : null}
                    </div>
                    {panelSecure && sslMode === "http" && (
                      <Alert variant="warning" className="py-2 small mt-2 mb-0">
                        {t("admin.nodeSslRequiredHint")}
                      </Alert>
                    )}
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>
                      {t("admin.nodeConnectPort")}{" "}
                      <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="number"
                      style={{ maxWidth: "10rem" }}
                      value={daemonPort}
                      onChange={(e) => setDaemonPort(e.target.value)}
                      min={1}
                      max={65535}
                      required
                    />
                    <Form.Text muted>
                      {sslMode === "https-proxy"
                        ? t("admin.nodePortHintProxy")
                        : sslMode === "https"
                          ? t("admin.nodePortHintHttps")
                          : t("admin.nodePortHintHttp")}
                    </Form.Text>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>{t("admin.nodeSslMode")}</Form.Label>
                    <Form.Select
                      value={sslMode}
                      onChange={(e) => setSslMode(e.target.value as SslMode)}
                    >
                      <option value="http">{t("admin.nodeSslHttp")}</option>
                      <option value="https">{t("admin.nodeSslHttps")}</option>
                      <option value="https-proxy">
                        {t("admin.nodeSslHttpsProxy")}
                      </option>
                    </Form.Select>
                    <Form.Text muted>
                      {sslMode === "https-proxy"
                        ? t("admin.nodeSslProxyHint")
                        : sslMode === "https"
                          ? t("admin.nodeSslHttpsHint")
                          : t("admin.nodeSslHttpHint")}
                    </Form.Text>
                    {panelSecure && sslMode === "http" && (
                      <Alert variant="danger" className="py-2 small mt-2 mb-0">
                        {t("admin.nodeSslMismatch")}
                      </Alert>
                    )}
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>{t("admin.locationLabel")}</Form.Label>
                    <Form.Control
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      maxLength={64}
                      placeholder={t("admin.locationPlaceholder")}
                    />
                    <Form.Text muted>{t("admin.locationHint")}</Form.Text>
                  </Form.Group>

                  <div className="small text-secondary mb-3 font-monospace">
                    {t("admin.nodePreviewUrl")}:{" "}
                    {`${schemeFromSslMode(sslMode)}://${fqdn.trim() || "…"}:${daemonPort || "…"}`}
                    {sslMode === "https-proxy" ? (
                      <span className="ms-2 badge text-bg-secondary">
                        {t("admin.nodeBehindProxyBadge")}
                      </span>
                    ) : null}
                  </div>

                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy ? (
                      <Spinner size="sm" animation="border" />
                    ) : (
                      t("common.save")
                    )}
                  </Button>
                </Form>
              </section>
            </Tab.Pane>

            <Tab.Pane eventKey="allocations">
              <section className="admin-inset-card">
                <h2 className="admin-section-title mb-3">
                  <i className="fa-solid fa-ethernet" aria-hidden />
                  {t("admin.portPool")}
                </h2>
                <NodePortPoolPanel
                  nodeId={node.id}
                  nodeName={node.name}
                  embedded
                  onError={(msg) => {
                    setLocalError(msg);
                    onError(msg);
                  }}
                  onNotice={(msg) => {
                    setLocalNotice(msg);
                    onNotice(msg);
                  }}
                />
              </section>
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </Modal.Body>
      <Modal.Footer className="border-top">
        <Button variant="outline-secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/** Optional one-shot token banner used by the nodes page. */
export function NodeTokenAlert({
  token,
  onDismiss,
}: {
  token: string;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <Alert variant="warning" dismissible onClose={onDismiss}>
      <div className="fw-semibold mb-1">Daemon token</div>
      <code className="user-break user-select-all">{token}</code>
      <div className="mt-2">
        <Button
          size="sm"
          variant="outline-dark"
          onClick={() => void copyText(token)}
        >
          {t("common.copy")} token
        </Button>
      </div>
    </Alert>
  );
}

/** Tiny client-side reachability probe (opaque fetch like Pelican). */
export function useNodeReachable(url: string): "loading" | "online" | "offline" {
  const [status, setStatus] = useState<"loading" | "online" | "offline">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    void fetch(url, { mode: "no-cors", signal: ctrl.signal })
      .then(() => {
        if (!cancelled) setStatus("online");
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [url]);

  return status;
}
