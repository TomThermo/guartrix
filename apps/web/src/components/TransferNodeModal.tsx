import { useEffect, useState } from "react";
import type { DaemonNode, McServer, TransferJobStatus } from "@msm/shared";
import { Alert, Button, Form, Modal, ProgressBar, Spinner } from "react-bootstrap";
import { api } from "../api";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onTransferred: (server: McServer) => void;
}

export function TransferNodeModal({
  server,
  busy = false,
  onCancel,
  onTransferred,
}: Props) {
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
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load nodes"),
      )
      .finally(() => setLoading(false));
  }, [server.id, server.nodeId, server.port]);

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
              setError(r.transfer.error ?? "Transfer failed");
              onTransferred(r.server);
            }
          } else if (
            r.server.status !== "TRANSFERRING" &&
            !r.transfer
          ) {
            // Job map expired but status settled.
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
  }, [running, server.id, onTransferred]);

  async function onStart() {
    setError(null);
    setJob(null);
    if (!nodeId) {
      setError("Pick a destination node");
      return;
    }
    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum < 1024 || portNum > 65535) {
      setError("Port must be between 1024 and 65535");
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
      setError(err instanceof Error ? err.message : "Transfer failed");
    }
  }

  const progress =
    job != null
      ? Math.min(100, Math.max(0, job.percent ?? 0))
      : running
        ? 5
        : 0;

  return (
    <Modal show onHide={running ? undefined : onCancel} backdrop="static" centered>
      <Modal.Header closeButton={!running}>
        <Modal.Title>
          <i className="fa-solid fa-server me-2" />
          Move to another node
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}
        <p className="small text-secondary">
          Moves <strong>{server.name}</strong> from{" "}
          <strong>{server.nodeName ?? "current node"}</strong> to another node.
          The server must be stopped. Extra ports move with it if free on the
          destination. Databases are copied to the destination.
        </p>

        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : nodes.length === 0 ? (
          <Alert variant="warning" className="py-2 mb-0">
            No other nodes available. Add a remote node under System first.
          </Alert>
        ) : (
          <>
            <Form.Group className="mb-3" controlId="transfer-node">
              <Form.Label>Destination node</Form.Label>
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
              <Form.Label>Primary port</Form.Label>
              <Form.Control
                type="number"
                min={1024}
                max={65535}
                value={port}
                disabled={running || busy}
                onChange={(e) => setPort(e.target.value)}
              />
              <Form.Text className="text-secondary">
                Keep the current port if it is free on the destination.
              </Form.Text>
            </Form.Group>
            <Form.Check
              className="mb-3"
              type="checkbox"
              id="transfer-start"
              label="Start the server after a successful move"
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
                    ? "Transfer complete"
                    : "Transfer failed"
                  : job?.detail || job?.step || "Starting…"}
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
        <Button
          variant="outline-secondary"
          onClick={onCancel}
          disabled={running}
        >
          {job?.done ? "Close" : "Cancel"}
        </Button>
        {!job?.done && (
          <Button
            variant="primary"
            disabled={running || busy || loading || nodes.length === 0 || !nodeId}
            onClick={() => void onStart()}
          >
            {running ? (
              <>
                <Spinner size="sm" className="me-2" /> Moving…
              </>
            ) : (
              <>
                <i className="fa-solid fa-right-left me-1" />
                Move server
              </>
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
