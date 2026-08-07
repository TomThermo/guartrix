import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DaemonNode, NodeTestResult } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  InputGroup,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { AddNodeModal } from "../components/AddNodeModal";
import { NodePortPoolPanel } from "../components/NodePortPoolPanel";
import { copyText, formatGb } from "../utils";

function statusVariant(
  status: DaemonNode["status"],
): "success" | "danger" | "secondary" {
  if (status === "ONLINE") return "success";
  if (status === "OFFLINE") return "danger";
  return "secondary";
}

/** Parse panel→daemon URL into scheme / host / port. */
function parseDaemonPublicUrl(raw: string): {
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

export function SystemSettingsPage() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<DaemonNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [installNode, setInstallNode] = useState<DaemonNode | null>(null);

  const refresh = useCallback(async () => {
    const { nodes: list } = await api.listAdminNodes();
    setNodes(list);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function onTest(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = (await api.testNode(id)) as NodeTestResult & {
        node: DaemonNode;
      };
      await refresh();
      if (result.ok) {
        setNotice(
          `Connection OK — ${result.system?.hostname ?? "daemon"} · ${result.system?.daemonVersion ?? ""}`,
        );
      } else {
        setError(result.error ?? "Test failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onRegenerate(id: string) {
    if (
      !confirm(
        "Generate a new token? The daemon must get DAEMON_TOKEN updated.",
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await api.regenerateNodeToken(id);
      setNewToken(res.token);
      setNotice(
        "New token created — copy it now, or open Install again in the modal.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this node?")) return;
    setBusyId(id);
    setError(null);
    try {
      await api.deleteNode(id);
      setNotice("Node deleted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusyId(id);
    setError(null);
    try {
      await api.updateNode(id, { name: trimmed });
      setEditingId(null);
      setNotice("Node name updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveUrl(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const parsed = parseDaemonPublicUrl(editUrl);
      await api.updateNode(id, parsed);
      setEditingUrlId(null);
      setNotice(
        "Daemon URL updated. Use Test connection — for a local node the daemon must listen where the panel can reach it.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveLocation(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.updateNode(id, {
        location: editLocation.trim() || null,
      });
      setEditingLocationId(null);
      setNotice("Node location updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">{t("admin.systemTitle")}</h1>
          <p className="text-secondary mb-0 small">{t("admin.systemSubtitle")}</p>
        </div>
        <Stack direction="horizontal" gap={2} className="flex-wrap">
          <Button
            variant="primary"
            onClick={() => {
              setInstallNode(null);
              setShowAddModal(true);
            }}
          >
            <i className="fa-solid fa-plus me-2" />
            {t("admin.addNode")}
          </Button>
          <Link to="/admin/users" className="btn btn-sm btn-outline-secondary">
            {t("nav.users")}
          </Link>
        </Stack>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {newToken && (
        <Alert variant="warning">
          <div className="fw-semibold mb-1">Daemon token</div>
          <code className="user-break user-select-all">{newToken}</code>
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline-dark"
              onClick={() => void copyText(newToken)}
            >
              {t("common.copy")} token
            </Button>
          </div>
        </Alert>
      )}

      {nodes.length === 0 && !error && (
        <Alert variant="info">
          No nodes in the database. Restart the panel — the local daemon node will then
          be created automatically and existing servers will be assigned to it.
        </Alert>
      )}

      <Row className="g-3 mb-4">
        {nodes.map((node) => (
          <Col key={node.id} xs={12} lg={6}>
            <Card className="h-100">
              <Card.Body>
                <Stack direction="horizontal" className="justify-content-between mb-2">
                  <div className="min-w-0 flex-grow-1 me-2">
                    {editingId === node.id ? (
                      <InputGroup size="sm" className="mb-1">
                        <Form.Control
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={64}
                          autoFocus
                        />
                        <Button
                          variant="primary"
                          disabled={busyId === node.id || !editName.trim()}
                          onClick={() => void onRename(node.id)}
                        >
                          {t("common.save")}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          onClick={() => setEditingId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </InputGroup>
                    ) : (
                      <Card.Title className="h5 mb-0 d-flex align-items-center gap-2">
                        <span className="text-truncate">{node.name}</span>
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-secondary"
                          title="Rename"
                          onClick={() => {
                            setEditingId(node.id);
                            setEditName(node.name);
                            setEditingUrlId(null);
                          }}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </Card.Title>
                    )}
                    <div className="small text-secondary">
                      {editingUrlId === node.id ? (
                        <InputGroup size="sm" className="mt-1">
                          <Form.Control
                            className="font-monospace"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            placeholder="http://127.0.0.1:8081"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void onSaveUrl(node.id);
                              }
                              if (e.key === "Escape") setEditingUrlId(null);
                            }}
                          />
                          <Button
                            variant="primary"
                            disabled={busyId === node.id || !editUrl.trim()}
                            onClick={() => void onSaveUrl(node.id)}
                          >
                            {t("common.save")}
                          </Button>
                          <Button
                            variant="outline-secondary"
                            onClick={() => setEditingUrlId(null)}
                          >
                            {t("common.cancel")}
                          </Button>
                        </InputGroup>
                      ) : (
                        <span className="d-inline-flex align-items-center gap-2">
                          <span className="font-monospace">{node.publicUrl}</span>
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-secondary"
                            title="Edit daemon URL"
                            onClick={() => {
                              setEditingUrlId(node.id);
                              setEditUrl(node.publicUrl);
                              setEditingId(null);
                            }}
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge bg={statusVariant(node.status)}>{node.status}</Badge>
                </Stack>
                <dl className="row small mb-3">
                  <dt className="col-5 text-secondary">Type</dt>
                  <dd className="col-7">{node.isLocal ? "Local" : "Remote"}</dd>
                  <dt className="col-5 text-secondary">Location</dt>
                  <dd className="col-7">
                    {editingLocationId === node.id ? (
                      <InputGroup size="sm">
                        <Form.Control
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          maxLength={64}
                          placeholder="eu-west, Frankfurt…"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void onSaveLocation(node.id);
                            }
                            if (e.key === "Escape") setEditingLocationId(null);
                          }}
                        />
                        <Button
                          variant="primary"
                          disabled={busyId === node.id}
                          onClick={() => void onSaveLocation(node.id)}
                        >
                          {t("common.save")}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          onClick={() => setEditingLocationId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </InputGroup>
                    ) : (
                      <span className="d-inline-flex align-items-center gap-2">
                        <span>{node.location || "—"}</span>
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-secondary"
                          title="Edit location"
                          onClick={() => {
                            setEditingLocationId(node.id);
                            setEditLocation(node.location ?? "");
                            setEditingId(null);
                            setEditingUrlId(null);
                          }}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                      </span>
                    )}
                  </dd>
                  <dt className="col-5 text-secondary">Servers</dt>
                  <dd className="col-7">{node.serverCount}</dd>
                  <dt className="col-5 text-secondary">RAM total</dt>
                  <dd className="col-7">{formatGb(node.memoryMb)}</dd>
                  <dt className="col-5 text-secondary">RAM used</dt>
                  <dd className="col-7">
                    {formatGb(node.memoryUsedMb)}
                    {node.memoryMb > 0 && (
                      <span className="text-secondary">
                        {" "}
                        ({Math.min(100, Math.round((node.memoryUsedMb / node.memoryMb) * 100))}%)
                      </span>
                    )}
                  </dd>
                  <dt className="col-5 text-secondary">RAM available</dt>
                  <dd className="col-7">
                    {node.memoryMb > 0 ? formatGb(node.memoryAvailableMb) : "—"}
                  </dd>
                  <dt className="col-5 text-secondary">Last seen</dt>
                  <dd className="col-7">
                    {node.lastSeenAt
                      ? new Date(node.lastSeenAt).toLocaleString()
                      : "—"}
                  </dd>
                  <dt className="col-5 text-secondary">SFTP host</dt>
                  <dd className="col-7 font-monospace small">
                    {node.sftpHostname
                      ? `${node.sftpHostname}:${node.sftpPort}`
                      : "—"}
                  </dd>
                </dl>
                {node.memoryMb > 0 && (
                  <div
                    className="progress mb-3"
                    style={{ height: "0.45rem" }}
                    title={`${formatGb(node.memoryUsedMb)} / ${formatGb(node.memoryMb)}`}
                  >
                    <div
                      className={`progress-bar ${
                        node.memoryAvailableMb < 1024 ? "bg-warning" : "bg-success"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((node.memoryUsedMb / node.memoryMb) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                )}
                <Stack direction="horizontal" gap={2} className="flex-wrap">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busyId === node.id}
                    onClick={() => void onTest(node.id)}
                  >
                    {busyId === node.id ? (
                      <Spinner size="sm" animation="border" />
                    ) : (
                      "Test connection"
                    )}
                  </Button>
                  {!node.isLocal && (
                    <Button
                      size="sm"
                      variant="outline-primary"
                      disabled={busyId === node.id}
                      onClick={() => {
                        setShowAddModal(false);
                        setInstallNode(node);
                      }}
                    >
                      Install daemon
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={busyId === node.id}
                    onClick={() => void onRegenerate(node.id)}
                  >
                    New token
                  </Button>
                  {!node.isLocal && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={busyId === node.id}
                      onClick={() => void onDelete(node.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  )}
                </Stack>
                <NodePortPoolPanel
                  nodeId={node.id}
                  nodeName={node.name}
                  onError={setError}
                  onNotice={setNotice}
                />
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="border-secondary">
        <Card.Body>
          <Card.Title className="h5">How do I add a node?</Card.Title>
          <ol className="small mb-3">
            <li>
              Click <strong>Add node</strong> — the wizard explains what a node is.
            </li>
            <li>
              Enter a name and the IP/hostname the <em>panel</em> uses to reach the VPS
              (e.g. <code>192.168.1.10</code> on LAN, or a public IP).
            </li>
            <li>
              Install the daemon via SSH in the modal; you will see{" "}
              <strong>live output</strong> from the remote server.
            </li>
            <li>
              Use Test connection until status is <Badge bg="success">ONLINE</Badge>, then
              create a Minecraft server and select that node.
            </li>
          </ol>
          <Button
            variant="primary"
            onClick={() => {
              setInstallNode(null);
              setShowAddModal(true);
            }}
          >
            <i className="fa-solid fa-plus me-2" />
            {t("admin.addNode")}
          </Button>
        </Card.Body>
      </Card>

      {(showAddModal || installNode) && (
        <AddNodeModal
          key={installNode?.id ?? "new"}
          existingNode={installNode}
          onClose={() => {
            setShowAddModal(false);
            setInstallNode(null);
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
