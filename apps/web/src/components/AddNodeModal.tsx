import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DaemonNode } from "@msm/shared";
import { Alert, Button, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { DetailsStep, type NodeSslMode } from "./add-node/DetailsStep";
import { DoneStep } from "./add-node/DoneStep";
import { HowtoStep } from "./add-node/HowtoStep";
import { InstallStep, type InstallInfo } from "./add-node/InstallStep";

type Step = "howto" | "details" | "install" | "done";

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
  const [sslMode, setSslMode] = useState<NodeSslMode>("http");
  const [daemonPort, setDaemonPort] = useState(8081);
  const [location, setLocation] = useState("");

  const [install, setInstall] = useState<InstallInfo | null>(null);
  const [nodeLabel, setNodeLabel] = useState(existingNode?.name ?? "");

  const [sshHost, setSshHost] = useState(existingNode?.fqdn ?? "");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshPassword, setSshPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [panelPassword, setPanelPassword] = useState("");
  const [trustHostKey, setTrustHostKey] = useState(false);
  const [replaceHostKey, setReplaceHostKey] = useState(false);
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState<string | null>(
    existingNode?.sshHostKeyFingerprint ?? null,
  );
  const [hostKeyNeedsTrust, setHostKeyNeedsTrust] = useState(false);
  const [hostKeyMismatch, setHostKeyMismatch] = useState(false);
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
        if (res.sshHostKeyFingerprint) {
          setHostKeyFingerprint(res.sshHostKeyFingerprint);
        } else if (existingNode.sshHostKeyFingerprint) {
          setHostKeyFingerprint(existingNode.sshHostKeyFingerprint);
        }
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

  // Keep the live SSH log pinned to the newest output after each append paints.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const snap = () => {
      el.scrollTop = el.scrollHeight;
    };
    snap();
    const raf = requestAnimationFrame(snap);
    return () => cancelAnimationFrame(raf);
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
        scheme: sslMode === "http" ? "http" : "https",
        behindProxy: sslMode === "https-proxy",
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

  async function onRemoteInstall(
    e: FormEvent,
    overrides?: { trustHostKey?: boolean; replaceHostKey?: boolean },
  ) {
    e.preventDefault();
    if (!install) return;
    const useTrust = overrides?.trustHostKey ?? trustHostKey;
    const useReplace = overrides?.replaceHostKey ?? replaceHostKey;
    if (overrides?.trustHostKey) setTrustHostKey(true);
    if (overrides?.replaceHostKey) setReplaceHostKey(true);
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
          panelPassword,
          trustHostKey: useTrust || undefined,
          replaceHostKey: useReplace || undefined,
          expectedHostKeyFingerprint:
            useTrust || useReplace ? (hostKeyFingerprint ?? undefined) : undefined,
        },
        {
          signal: ac.signal,
          onChunk: (chunk) => {
            if (chunk.hostKeyFingerprint) {
              setHostKeyFingerprint(chunk.hostKeyFingerprint);
            }
            if (chunk.hostKeyNeedsTrust) setHostKeyNeedsTrust(true);
            if (chunk.hostKeyMismatch) setHostKeyMismatch(true);
            if (chunk.type === "status" && chunk.message) {
              appendLog(`\n▸ ${chunk.message}\n`);
            } else if (chunk.type === "stdout" && chunk.data) {
              appendLog(chunk.data);
            } else if (chunk.type === "stderr" && chunk.data) {
              appendLog(chunk.data);
            } else if (chunk.type === "done") {
              if (chunk.ok) {
                setInstallOk(true);
                setHostKeyNeedsTrust(false);
                setHostKeyMismatch(false);
                const test = chunk.test as
                  | { ok?: boolean; error?: string; system?: { hostname?: string } }
                  | undefined;
                if (test?.ok) {
                  setTestSummary(`Connection OK — ${test.system?.hostname ?? "daemon"}`);
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
      setTrustHostKey(false);
      setReplaceHostKey(false);
      if (!testSummary && res.message) {
        setTestSummary(res.message);
      }
      setStep("done");
      await onChanged();
    } catch (err) {
      if (ac.signal.aborted) return;
      const keyed = err as Error & {
        hostKeyFingerprint?: string;
        hostKeyMismatch?: boolean;
        hostKeyNeedsTrust?: boolean;
      };
      if (keyed.hostKeyFingerprint) {
        setHostKeyFingerprint(keyed.hostKeyFingerprint);
      }
      if (keyed.hostKeyNeedsTrust) {
        setHostKeyNeedsTrust(true);
        setTrustHostKey(true);
        setError(null);
        appendLog(
          `\n▸ ${t("admin.sshHostKeyNeedsTrustLog", {
            fingerprint: keyed.hostKeyFingerprint ?? "?",
          })}\n`,
        );
        return;
      }
      if (keyed.hostKeyMismatch) {
        setHostKeyMismatch(true);
        setReplaceHostKey(false);
        setError(null);
        appendLog(
          `\n▸ ${t("admin.sshHostKeyMismatchLog", {
            fingerprint: keyed.hostKeyFingerprint ?? "?",
          })}\n`,
        );
        return;
      }
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

        {step === "howto" && <HowtoStep />}

        {step === "details" && (
          <DetailsStep
            name={name}
            onNameChange={setName}
            fqdn={fqdn}
            onFqdnChange={setFqdn}
            sslMode={sslMode}
            onSslModeChange={setSslMode}
            daemonPort={daemonPort}
            onDaemonPortChange={setDaemonPort}
            location={location}
            onLocationChange={setLocation}
            onSubmit={(e) => void onCreate(e)}
          />
        )}

        {step === "install" && (
          <InstallStep
            busy={busy}
            install={install}
            existingNodeHasHostKey={!!existingNode?.sshHostKeyFingerprint}
            sshHost={sshHost}
            onSshHostChange={setSshHost}
            sshPort={sshPort}
            onSshPortChange={setSshPort}
            sshUser={sshUser}
            onSshUserChange={setSshUser}
            sshPassword={sshPassword}
            onSshPasswordChange={setSshPassword}
            sshKey={sshKey}
            onSshKeyChange={setSshKey}
            panelPassword={panelPassword}
            onPanelPasswordChange={setPanelPassword}
            trustHostKey={trustHostKey}
            onTrustHostKeyChange={setTrustHostKey}
            replaceHostKey={replaceHostKey}
            onReplaceHostKeyChange={setReplaceHostKey}
            hostKeyFingerprint={hostKeyFingerprint}
            hostKeyNeedsTrust={hostKeyNeedsTrust}
            hostKeyMismatch={hostKeyMismatch}
            log={log}
            logRef={logRef}
            onSubmit={(e) => void onRemoteInstall(e)}
            onTrustAndContinue={(e) => void onRemoteInstall(e, { trustHostKey: true })}
            onReplaceAndContinue={(e) => void onRemoteInstall(e, { replaceHostKey: true })}
          />
        )}

        {step === "done" && (
          <DoneStep
            installOk={installOk}
            testSummary={testSummary}
            nodeLabel={nodeLabel}
            log={log}
          />
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
            <Button variant="outline-secondary" disabled={busy} onClick={() => setStep("howto")}>
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
