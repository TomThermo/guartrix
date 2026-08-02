import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PortAllocation, ServerType } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import { api } from "../api";

interface Props {
  serverId: string;
  serverType?: ServerType;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canInstallAddons?: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onPrimaryChanged?: () => void;
}

export function AllocationsPanel({
  serverId,
  serverType,
  canCreate = false,
  canUpdate = false,
  canDelete = false,
  canInstallAddons = false,
  onError,
  onNotice,
  onPrimaryChanged,
}: Props) {
  const [allocations, setAllocations] = useState<PortAllocation[]>([]);
  const [free, setFree] = useState<PortAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [geyserBusy, setGeyserBusy] = useState(false);
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [pickId, setPickId] = useState("");
  const [alsoUdp, setAlsoUdp] = useState(false);

  const showGeyser =
    canInstallAddons && (serverType === "PAPER" || serverType === "PURPUR");

  const refresh = useCallback(async () => {
    const data = await api.listAllocations(serverId);
    setAllocations(data.allocations);
    setFree(data.free);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) =>
        onError(
          err instanceof Error ? err.message : "Failed to load allocations",
        ),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  async function installGeyser() {
    if (!showGeyser) return;
    if (
      !confirm(
        "Install Geyser + Floodgate from Modrinth and open UDP on the primary port for Bedrock?\n\nA backup will be created. Restart after install.",
      )
    ) {
      return;
    }
    setGeyserBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.installGeyser(serverId, true);
      onNotice(
        `Installed ${result.installed.join(", ")}. ${result.hint}`,
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Geyser install failed");
    } finally {
      setGeyserBusy(false);
    }
  }

  async function onAssignFree(e: FormEvent) {
    e.preventDefault();
    if (!canCreate || !pickId) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.assignAllocation(serverId, {
        allocationId: pickId,
        alsoUdp,
      });
      setPickId("");
      onNotice(
        "Allocation assigned. Restart the server before the new port becomes active.",
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not assign allocation");
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePort(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const n = Number(port);
    if (!Number.isFinite(n) || n < 1024 || n > 65535) {
      onError("Enter a valid port (1024–65535).");
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.assignAllocation(serverId, {
        port: n,
        protocol,
        alsoUdp: protocol === "tcp" ? alsoUdp : false,
      });
      setPort("");
      onNotice(
        `Port ${n}/${protocol} assigned. Restart the server before the port becomes active.`,
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not add port");
    } finally {
      setBusy(false);
    }
  }

  async function onMakePrimary(a: PortAllocation) {
    if (!canUpdate || a.isPrimary) return;
    if (
      !window.confirm(
        `Make ${a.port}/${a.protocol} the primary game port? The server must be stopped.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.updateAllocation(serverId, a.id, {
        isPrimary: true,
        alsoUdp,
      });
      onNotice(
        `Primary port is now ${a.port}.${alsoUdp ? " UDP companion ensured." : ""} Restart if the server was running.`,
      );
      onPrimaryChanged?.();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not set primary");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(a: PortAllocation) {
    if (!canDelete || a.isPrimary) return;
    if (!window.confirm(`Remove port ${a.port}/${a.protocol} from this server?`)) {
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.deleteAllocation(serverId, a.id);
      onNotice(`Port ${a.port} removed. Restart if the server is running.`);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove allocation");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading allocations…
      </div>
    );
  }

  return (
    <div className="databases-panel">
      <header className="databases-panel-header">
        <h2 className="databases-panel-title">Network / Allocations</h2>
        <p className="databases-panel-lead mb-0">
          IP and port bindings for this server. Primary is the game port; extras
          are additional ports players or services can use.
        </p>
      </header>

      <Alert variant="warning" className="mb-3">
        <strong>Restart required.</strong> Extra TCP/UDP ports only become active
        after the next <em>start</em> or <em>restart</em>. Assigning or removing
        ports while the server is running will not change live bindings until then.
      </Alert>

      {showGeyser && (
        <Alert variant="light" className="border mb-3">
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-mobile-screen me-2" />
            Bedrock (Geyser)
          </div>
          <p className="small text-secondary mb-2">
            One-click install Geyser + Floodgate and open UDP on the primary port
            so Bedrock clients can join.
          </p>
          <Button
            size="sm"
            variant="outline-primary"
            disabled={geyserBusy}
            onClick={() => void installGeyser()}
          >
            {geyserBusy ? <Spinner size="sm" /> : "Install Geyser"}
          </Button>
        </Alert>
      )}

      <Row className="g-3 databases-layout">
        <Col xs={12} lg={8}>
          <section className="databases-section h-100">
            <h3 className="databases-section-title">Assigned</h3>
            {allocations.length === 0 ? (
              <p className="databases-empty mb-0">No allocations yet.</p>
            ) : (
              <div className="table-responsive">
                <Table hover size="sm" className="align-middle mb-0 databases-table">
                  <thead>
                    <tr>
                      <th>IP</th>
                      <th>Port</th>
                      <th>Protocol</th>
                      <th>Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <code>{a.ip}</code>
                        </td>
                        <td>
                          <code>{a.port}</code>{" "}
                          {a.isPrimary && (
                            <Badge bg="primary" className="ms-1">
                              Primary
                            </Badge>
                          )}
                        </td>
                        <td>{a.protocol.toUpperCase()}</td>
                        <td className="text-secondary small">{a.notes || "—"}</td>
                        <td className="text-end text-nowrap">
                          {canUpdate && !a.isPrimary && a.protocol === "tcp" && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              className="me-1"
                              disabled={busy}
                              onClick={() => void onMakePrimary(a)}
                            >
                              Make primary
                            </Button>
                          )}
                          {canDelete && !a.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={busy}
                              onClick={() => void onRemove(a)}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </section>
        </Col>

        {canCreate && (
          <Col xs={12} lg={4}>
            <section className="databases-section">
              <h3 className="databases-section-title">Assign port</h3>
              {free.length > 0 && (
                <Form onSubmit={onAssignFree} className="mb-3">
                  <Form.Label className="small">From node pool</Form.Label>
                  <Form.Select
                    size="sm"
                    value={pickId}
                    onChange={(e) => setPickId(e.target.value)}
                    className="mb-2"
                  >
                    <option value="">Select free allocation…</option>
                    {free.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.ip}:{f.port}/{f.protocol}
                      </option>
                    ))}
                  </Form.Select>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !pickId}
                    variant="primary"
                  >
                    Assign
                  </Button>
                </Form>
              )}
              <Form onSubmit={onCreatePort}>
                <Form.Label className="small">Or create by port</Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  min={1024}
                  max={65535}
                  placeholder="25566"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="mb-2"
                />
                <Form.Select
                  size="sm"
                  value={protocol}
                  onChange={(e) =>
                    setProtocol(e.target.value === "udp" ? "udp" : "tcp")
                  }
                  className="mb-2"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </Form.Select>
                {protocol === "tcp" && (
                  <Form.Check
                    type="checkbox"
                    className="small mb-2"
                    label="Also open UDP on the same port (query / Geyser)"
                    checked={alsoUdp}
                    onChange={(e) => setAlsoUdp(e.target.checked)}
                  />
                )}
                <Button type="submit" size="sm" disabled={busy} variant="primary">
                  Add port
                </Button>
              </Form>
              <Form.Check
                type="checkbox"
                className="small mt-3"
                label="When making primary: also ensure UDP on that port"
                checked={alsoUdp}
                onChange={(e) => setAlsoUdp(e.target.checked)}
              />
              <Alert variant="light" className="small mt-3 mb-0 border">
                Primary mirrors the game port in Settings. Use the UDP companion
                for Minecraft query or Geyser on the same number.
              </Alert>
            </section>
          </Col>
        )}
      </Row>
    </div>
  );
}
