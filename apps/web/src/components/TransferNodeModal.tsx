import { useEffect, useState } from "react";
import type { DaemonNode, McServer, TransferJobStatus } from "@msm/shared";
import { Alert, Button, Form, Modal, ProgressBar, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onTransferred: (server: McServer) => void;
}

export function TransferNodeModal({ server, busy = false, onCancel, onTransferred }: Props) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<DaemonNode[]>([]);
  const [nodeId, setNodeId] = useState("");
  const [port, setPort] = useState(String(server.port));
  const [startAfter, setStartAfter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<TransferJobStatus | null>(null);

  useEffect(() => {
    setPort(String(server.port));
    setLoading(true);
    void api
      .listNodes()
      .then((r) => {
        const others = r.nodes.filter((n) => n.id !== server.nodeId);
        setNodes(others);
        setNodeId(others[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("modals.transferNodeFailed")))
      .finally(() => setLoading(false));
  }, [server.nodeId, server.port, t]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void api
        .getServerTransfer(server.id)
        .then((r) => {
          if (cancelled) return;
          if (r.transfer) setJob(r.transfer);
          if (r.transfer?.done) {
            setRunning(false);
            if (r.transfer.ok) {
              onTransferred(r.server);
            } else {
              setError(r.transfer.error ?? t("modals.transferNodeFailed"));
              onTransferred(r.server);
            }
          } else if (r.server.status !== "TRANSFERRING" && !r.transfer) {
            setRunning(false);
            onTransferred(r.server);
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [running, server.id, onTransferred, t]);

  async function onStart() {
    setError(null);
    setJob(null);
    if (!nodeId) {
      setError(t("modals.transferNodePick"));
      return;
    }
    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum < 1024 || portNum > 65535) {
      setError(t("modals.transferNodePortInvalid"));
      return;
    }
    setRunning(true);
    try {
      const result = await api.transferServer(server.id, {
        nodeId,
        port: portNum === server.port ? undefined : portNum,
        startAfter,
      });
      setJob(result.transfer);
      onTransferred(result.server);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : t("modals.transferNodeFailed"));
    }
  }

  const progress = job != null ? Math.min(100, Math.max(0, job.percent ?? 0)) : running ? 5 : 0;

  return (
    <Modal show onHide={running ? undefined : onCancel} backdrop="static" centered>
      <Modal.Header closeButton={!running}>
        <Modal.Title>
          <i className="fa-solid fa-server me-2" />
          {t("modals.transferNodeTitle")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}
        <p className="small text-secondary">
          {t("modals.transferNodeHelp", {
            name: server.name,
            node: server.nodeName ?? t("common.node"),
          })}
        </p>

        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : nodes.length === 0 ? (
          <Alert variant="warning" className="py-2 mb-0">
            {t("modals.transferNodeNoNodes")}
          </Alert>
        ) : (
          <>
            <Form.Group className="mb-3" controlId="transfer-node">
              <Form.Label>{t("modals.transferNodeDestination")}</Form.Label>
              <Form.Select
                value={nodeId}
                disabled={running || busy}
                onChange={(e) => setNodeId(e.target.value)}
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.fqdn}) — {n.status}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3" controlId="transfer-port">
              <Form.Label>{t("modals.transferNodePrimaryPort")}</Form.Label>
              <Form.Control
                type="number"
                min={1024}
                max={65535}
                value={port}
                disabled={running || busy}
                onChange={(e) => setPort(e.target.value)}
              />
              <Form.Text className="text-secondary">{t("modals.transferNodePortHelp")}</Form.Text>
            </Form.Group>
            <Form.Check
              className="mb-3"
              type="checkbox"
              id="transfer-start"
              label={t("modals.transferNodeStartAfter")}
              checked={startAfter}
              disabled={running || busy}
              onChange={(e) => setStartAfter(e.target.checked)}
            />
          </>
        )}

        {(running || job) && (
          <div className="mt-2">
            <div className="small mb-1 d-flex justify-content-between gap-2">
              <span>
                {job?.done
                  ? job.ok
                    ? t("modals.transferNodeComplete")
                    : t("modals.transferNodeFailed")
                  : job?.detail || job?.step || t("modals.transferNodeStarting")}
              </span>
              <span className="text-secondary">{progress}%</span>
            </div>
            <ProgressBar
              now={progress}
              label={progress >= 12 ? `${progress}%` : undefined}
              animated={!job?.done}
              variant={job?.done ? (job.ok ? "success" : "danger") : "primary"}
            />
            {job?.bytesTotal != null && job.bytesTotal > 0 && !job.done && (
              <div className="small text-secondary mt-1">
                {(job.bytesTransferred ?? 0) > 0
                  ? `${Math.round(((job.bytesTransferred ?? 0) / job.bytesTotal) * 100)}% of payload · `
                  : ""}
                {Math.round(job.bytesTotal / (1024 * 1024))} MB total
              </div>
            )}
            {job && (
              <ol className="small text-secondary mt-2 mb-0 ps-3">
                {job.steps.map((s, i) => (
                  <li
                    key={s}
                    className={
                      i < job.stepIndex || (job.done && job.ok)
                        ? "text-success"
                        : i === job.stepIndex
                          ? "fw-semibold text-body"
                          : undefined
                    }
                  >
                    {s}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={running}>
          {job?.done ? t("common.close") : t("common.cancel")}
        </Button>
        {!job?.done && (
          <Button
            variant="primary"
            disabled={running || busy || loading || nodes.length === 0 || !nodeId}
            onClick={() => void onStart()}
          >
            {running ? (
              <>
                <Spinner size="sm" className="me-2" /> {t("modals.transferNodeMoving")}
              </>
            ) : (
              <>
                <i className="fa-solid fa-right-left me-1" />
                {t("modals.transferNodeMove")}
              </>
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
