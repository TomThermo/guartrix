import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DaemonNode } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { copyText } from "../utils";

type Step = "howto" | "details" | "install" | "done";

type InstallInfo = {
  nodeId: string;
  token: string;
  publicUrl: string;
  envFile: string;
  installCommand: string;
  steps: string[];
};

type Props = {
  /** When set, skip create and open install for this node. */
  existingNode?: DaemonNode | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

export function AddNodeModal({ existingNode, onClose, onChanged }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(existingNode ? "install" : "howto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [fqdn, setFqdn] = useState("");
  const [scheme, setScheme] = useState<"http" | "https">("http");
  const [daemonPort, setDaemonPort] = useState(8081);
  const [location, setLocation] = useState("");

  const [install, setInstall] = useState<InstallInfo | null>(null);
  const [nodeLabel, setNodeLabel] = useState(existingNode?.name ?? "");

  const [sshHost, setSshHost] = useState(existingNode?.fqdn ?? "");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshPassword, setSshPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [log, setLog] = useState("");
  const [installOk, setInstallOk] = useState(false);
  const [testSummary, setTestSummary] = useState<string | null>(null);

  const logRef = useRef<HTMLPreElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!existingNode) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void api
      .getNodeInstall(existingNode.id)
      .then((res) => {
        if (cancelled) return;
        setInstall({
          nodeId: existingNode.id,
          token: res.token,
          publicUrl: res.publicUrl,
          envFile: res.envFile,
          installCommand: res.installCommand,
          steps: res.steps,
        });
        setNodeLabel(existingNode.name);
        setSshHost(existingNode.fqdn);
        setStep("install");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [existingNode]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function appendLog(line: string) {
    setLog((prev) => (prev ? `${prev}${line}` : line));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createNode({
        name,
        fqdn,
        scheme,
        daemonPort,
        location: location.trim() || null,
      });
      setNodeLabel(res.node.name);
      const installRes = await api.getNodeInstall(res.node.id);
      setInstall({
        nodeId: res.node.id,
        token: installRes.token,
        publicUrl: installRes.publicUrl,
        envFile: installRes.envFile,
        installCommand: installRes.installCommand,
        steps: installRes.steps,
      });
      setSshHost(res.node.fqdn);
      setSshUser("ubuntu");
      setSshPassword("");
      setSshKey("");
      setLog("");
      setInstallOk(false);
      setTestSummary(null);
      setStep("install");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoteInstall(e: FormEvent) {
    e.preventDefault();
    if (!install) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setInstallOk(false);
    setTestSummary(null);
    setLog("");
    appendLog(`$ connecting ${sshUser}@${sshHost.trim() || "…"}:${sshPort}\n`);
    try {
      const res = await api.remoteInstallNode(
        install.nodeId,
        {
          sshHost: sshHost.trim() || undefined,
          sshPort,
          sshUser: sshUser.trim(),
          sshPassword: sshPassword || undefined,
          sshPrivateKey: sshKey.trim() || undefined,
        },
        {
          signal: ac.signal,
          onChunk: (chunk) => {
            if (chunk.type === "status" && chunk.message) {
              appendLog(`\n▸ ${chunk.message}\n`);
            } else if (chunk.type === "stdout" && chunk.data) {
              appendLog(chunk.data);
            } else if (chunk.type === "stderr" && chunk.data) {
              appendLog(chunk.data);
            } else if (chunk.type === "done") {
              if (chunk.ok) {
                setInstallOk(true);
                const test = chunk.test as
                  | { ok?: boolean; error?: string; system?: { hostname?: string } }
                  | undefined;
                if (test?.ok) {
                  setTestSummary(
                    `Connection OK — ${test.system?.hostname ?? "daemon"}`,
                  );
                } else if (test && test.ok === false) {
                  setTestSummary(
                    `Install finished, but the connection test failed: ${test.error ?? "unknown"}`,
                  );
                } else {
                  setTestSummary(t("admin.installFinishedTest"));
                }
              }
            }
          },
        },
      );
      setSshPassword("");
      setInstallOk(true);
      if (!testSummary && res.message) {
        setTestSummary(res.message);
      }
      setStep("done");
      await onChanged();
    } catch (err) {
      if (ac.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      appendLog(`\n✖ ${message}\n`);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }

  const canClose = !busy;
  const title =
    step === "howto"
        ? t("admin.addNode")
      : step === "details"
        ? t("admin.addNodeNew")
        : step === "install"
          ? t("admin.addNodeInstallTitle", { name: nodeLabel || "node" })
          : t("common.done");

  return (
    <Modal
      show
      onHide={canClose ? onClose : undefined}
      centered
      size="lg"
      backdrop="static"
      scrollable
    >
      <Modal.Header closeButton={canClose}>
        <Modal.Title className="d-flex align-items-center gap-2">
          <i className="fa-solid fa-server" />
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            <pre className="mb-0 small text-wrap" style={{ whiteSpace: "pre-wrap" }}>
              {error}
            </pre>
          </Alert>
        )}

        {step === "howto" && (
          <div>
            <p className="mb-3">
              A <strong>node</strong> is a separate VPS running the Guartrix daemon.
              Minecraft servers run on that machine; the
              panel sends power, console, and file actions using the node token.
            </p>
            <ol className="mb-3">
              <li>
                Create an Ubuntu VPS and note its <strong>public IP</strong> (or
                hostname).
              </li>
              <li>
                Make sure the <strong>panel host</strong> can reach that VPS on port{" "}
                <code>8081</code> (daemon) and <code>2022</code> (SFTP) — open the
                firewall, or let the installer open it.
              </li>
              <li>
                Important: for Host / FQDN, use the IP/hostname the <em>panel</em>{" "}
                uses to reach the daemon (not only an internal LAN IP if the panel is
                external).
              </li>
              <li>
                Then install via <strong>SSH</strong> in this wizard (live log), or
                copy the curl command and run it yourself on the VPS.
              </li>
              <li>
                Click <strong>Test connection</strong> until the node is{" "}
                <Badge bg="success">ONLINE</Badge>. Then create a Minecraft server and
                pick this node.
              </li>
            </ol>
            <Alert variant="info" className="small mb-0">
              SSH password/key are <strong>not stored</strong> — only used for this
              one-time install. User may be <code>ubuntu</code>, <code>root</code>, or
              another sudo user.
            </Alert>
          </div>
        )}

        {step === "details" && (
          <Form id="add-node-details" onSubmit={(e) => void onCreate(e)}>
            <p className="small text-secondary mb-3">
              Register the node in the panel. You install the daemon in the next step.
            </p>
            <Row className="g-2">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Name</Form.Label>
                  <Form.Control
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="node-2"
                    autoFocus
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Host / FQDN</Form.Label>
                  <Form.Control
                    value={fqdn}
                    onChange={(e) => setFqdn(e.target.value)}
                    required
                    placeholder="192.168.1.10 or node2.example.com"
                  />
                  <Form.Text className="text-secondary">
                    IP/hostname reachable from the panel server.
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Scheme</Form.Label>
                  <Form.Select
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value as "http" | "https")}
                  >
                    <option value="http">http (default LAN/VPS)</option>
                    <option value="https">https (TLS for the daemon)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Daemon port</Form.Label>
                  <Form.Control
                    type="number"
                    value={daemonPort}
                    onChange={(e) => setDaemonPort(Number(e.target.value) || 8081)}
                    min={1}
                    max={65535}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label>{t("admin.locationLabel")}</Form.Label>
                  <Form.Control
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={64}
                    placeholder={t("admin.locationPlaceholder")}
                  />
                  <Form.Text className="text-secondary">
                    {t("admin.locationHint")}
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
          </Form>
        )}

        {step === "install" && (
          <div>
            {busy && !install && (
              <div className="text-center py-4">
                <Spinner animation="border" />
              </div>
            )}
            {install && (
              <>
                <p className="small text-secondary mb-2">
                  Panel reaches this node at{" "}
                  <code className="user-select-all">{install.publicUrl}</code>
                </p>
                <Form onSubmit={(e) => void onRemoteInstall(e)} className="mb-3">
                  <Row className="g-2">
                    <Col md={5}>
                      <Form.Group>
                        <Form.Label>SSH host</Form.Label>
                        <Form.Control
                          value={sshHost}
                          onChange={(e) => setSshHost(e.target.value)}
                          required
                          disabled={busy}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>Port</Form.Label>
                        <Form.Control
                          type="number"
                          value={sshPort}
                          onChange={(e) => setSshPort(Number(e.target.value) || 22)}
                          disabled={busy}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={5}>
                      <Form.Group>
                        <Form.Label>Username</Form.Label>
                        <Form.Control
                          value={sshUser}
                          onChange={(e) => setSshUser(e.target.value)}
                          placeholder="ubuntu"
                          required
                          disabled={busy}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Password</Form.Label>
                        <Form.Control
                          type="password"
                          value={sshPassword}
                          onChange={(e) => setSshPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Ubuntu / root password"
                          disabled={busy}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Private key (optional)</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={sshKey}
                          onChange={(e) => setSshKey(e.target.value)}
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                          className="font-monospace small"
                          disabled={busy}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Text className="text-secondary d-block mb-2">
                    Password or key is enough. For key + passphrase, fill in both.
                  </Form.Text>
                  <Button
                    type="submit"
                    variant="success"
                    disabled={busy || (!sshPassword && !sshKey.trim())}
                  >
                    {busy ? (
                      <>
                        <Spinner size="sm" className="me-2" /> Installing on VPS…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-cloud-arrow-up me-2" />
                        Install via SSH
                      </>
                    )}
                  </Button>
                </Form>

                <div className="small text-secondary mb-1">
                  Live feedback from the remote server
                </div>
                <pre
                  ref={logRef}
                  className="bg-dark text-light p-3 rounded small mb-3"
                  style={{
                    maxHeight: 260,
                    overflow: "auto",
                    minHeight: 120,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {log ||
                    (busy
                      ? "Waiting for output…"
                      : "No output yet — start the install.")}
                </pre>

                <details>
                  <summary className="small text-secondary">
                    Manual: download-then-run install
                  </summary>
                  <pre className="bg-dark text-light p-2 rounded small mt-2 user-select-all">
                    {install.installCommand}
                  </pre>
                  <Stack direction="horizontal" gap={2} className="flex-wrap mt-2">
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => void copyText(install.installCommand)}
                    >
                      Copy command
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={() => void copyText(install.envFile)}
                    >
                      Copy daemon.env
                    </Button>
                  </Stack>
                </details>
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div>
            <Alert variant={installOk ? "success" : "warning"}>
              {installOk
                ? t("admin.daemonInstalled")
                : t("admin.installFinishedWarnings")}
            </Alert>
            {testSummary && <p className="mb-2">{testSummary}</p>}
            <ol className="mb-0">
              <li>{t("admin.doneCheckOnline")}</li>
              <li>{t("admin.doneCheckFirewall")}</li>
              <li>{t("admin.doneCreateServer", { name: nodeLabel })}</li>
            </ol>
            {log && (
              <details className="mt-3">
                <summary className="small text-secondary">Install log</summary>
                <pre
                  className="bg-dark text-light p-2 rounded small mt-2"
                  style={{ maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }}
                >
                  {log}
                </pre>
              </details>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="flex-wrap gap-2">
        {step === "howto" && (
          <>
            <Button variant="outline-secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => setStep("details")}>
              {t("common.next")}
            </Button>
          </>
        )}
        {step === "details" && (
          <>
            <Button
              variant="outline-secondary"
              disabled={busy}
              onClick={() => setStep("howto")}
            >
              {t("common.back")}
            </Button>
            <Button
              type="submit"
              form="add-node-details"
              variant="primary"
              disabled={busy || !name.trim() || !fqdn.trim()}
            >
              {busy ? <Spinner size="sm" /> : t("admin.createNodeInstall")}
            </Button>
          </>
        )}
        {step === "install" && (
          <>
            {!existingNode && !busy && (
              <Button
                variant="outline-secondary"
                onClick={() => setStep("details")}
                disabled={busy}
              >
                {t("common.back")}
              </Button>
            )}
            <Button variant="outline-secondary" disabled={busy} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            {installOk && (
              <Button variant="primary" onClick={() => setStep("done")}>
                {t("common.done")}
              </Button>
            )}
          </>
        )}
        {step === "done" && (
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
