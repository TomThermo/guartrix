import { useEffect, useState } from "react";
import type { DaemonNode, NodeTestResult } from "@msm/shared";
import { Alert, Badge, Button, Modal, Nav, Tab } from "react-bootstrap";
import { api } from "../../../api";
import { useI18n } from "../../../i18n/react";
import { NodePortPoolPanel } from "../../NodePortPoolPanel";
import { NodeConfigPanel } from "../NodeConfigPanel";
import { NodeAdvancedPanel } from "../NodeAdvancedPanel";
import { NodeBasicSettingsPanel } from "./NodeBasicSettingsPanel";
import { NodeOverviewPanel } from "./NodeOverviewPanel";
import {
  parseDaemonPublicUrl,
  schemeFromSslMode,
  sslModeFromNode,
  statusVariant,
  type SslMode,
  type TabId,
} from "./parse-daemon-url";
import { NodeTokenAlert } from "./NodeTokenAlert";
import { useNodeReachable } from "./useNodeReachable";

export { parseDaemonPublicUrl, NodeTokenAlert, useNodeReachable };

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
  const [panelSecure, setPanelSecure] = useState(() => window.location.protocol === "https:");

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
    node.memoryMb > 0 ? Math.min(100, Math.round((node.memoryUsedMb / node.memoryMb) * 100)) : 0;

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
    if (!confirm("Generate a new token? The daemon must get DAEMON_TOKEN updated.")) {
      return;
    }
    onBusy(node.id);
    setLocalError(null);
    onError(null);
    try {
      const res = await api.regenerateNodeToken(node.id);
      onNewToken(res.token);
      const msg = "New token created — copy it now, or open Install again in the modal.";
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
          <span className="text-truncate">{t("admin.editNodeTitle", { name: node.name })}</span>
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

        <Tab.Container activeKey={tab} onSelect={(k) => setTab((k as TabId) || "overview")}>
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
              <Nav.Link eventKey="advanced">
                <i className="fa-solid fa-screwdriver-wrench me-1" aria-hidden />
                {t("admin.nodeTabAdvanced")}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="config">
                <i className="fa-solid fa-file-code me-1" aria-hidden />
                {t("admin.nodeTabConfig")}
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
              <NodeOverviewPanel
                node={node}
                busy={busy}
                tabActive={tab === "overview"}
                ramPct={ramPct}
                onTest={onTest}
                onInstall={onInstall}
                onRegenerate={onRegenerate}
                onDelete={onDelete}
              />
            </Tab.Pane>

            <Tab.Pane eventKey="settings">
              <NodeBasicSettingsPanel
                busy={busy}
                name={name}
                onNameChange={setName}
                fqdn={fqdn}
                onFqdnChange={setFqdn}
                daemonPort={daemonPort}
                onDaemonPortChange={setDaemonPort}
                location={location}
                onLocationChange={setLocation}
                sslMode={sslMode}
                onSslModeChange={setSslMode}
                dnsLoading={dnsLoading}
                dnsOk={dnsOk}
                dnsAddresses={dnsAddresses}
                panelSecure={panelSecure}
                onSave={onSaveSettings}
              />
            </Tab.Pane>

            <Tab.Pane eventKey="advanced">
              <NodeAdvancedPanel
                node={node}
                busy={busy}
                onBusy={onBusy}
                onError={(msg) => {
                  setLocalError(msg);
                  onError(msg);
                }}
                onNotice={(msg) => {
                  setLocalNotice(msg);
                  onNotice(msg);
                }}
                onChanged={onChanged}
              />
            </Tab.Pane>

            <Tab.Pane eventKey="config">
              <section className="admin-inset-card">
                <h2 className="admin-section-title mb-3">
                  <i className="fa-solid fa-file-code" aria-hidden />
                  {t("admin.nodeTabConfig")}
                </h2>
                <NodeConfigPanel
                  node={node}
                  active={tab === "config"}
                  busy={busy}
                  onBusy={onBusy}
                  onError={(msg) => {
                    setLocalError(msg);
                    onError(msg);
                  }}
                  onNotice={(msg) => {
                    setLocalNotice(msg);
                    onNotice(msg);
                  }}
                  onNewToken={onNewToken}
                  onChanged={onChanged}
                  onInstallViaSsh={onInstall}
                />
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
