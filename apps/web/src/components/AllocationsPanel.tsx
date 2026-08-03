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
import { useI18n } from "../i18n/react";

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
  const { t } = useI18n();
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
          err instanceof Error ? err.message : t("allocations.loadFailed"),
        ),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  async function installGeyser() {
    if (!showGeyser) return;
    if (
      !confirm(t("allocations.geyserConfirm"))
    ) {
      return;
    }
    setGeyserBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.installGeyser(serverId, true);
      onNotice(
        t("allocations.noticeInstalled", {
          list: result.installed.join(", "),
          hint: result.hint,
        }),
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("allocations.geyserInstallFailed"));
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
      onNotice(t("allocations.noticeAssigned"));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("allocations.assignFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePort(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const n = Number(port);
    if (!Number.isFinite(n) || n < 1024 || n > 65535) {
      onError(t("allocations.invalidPort"));
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
        t("allocations.noticePortAssigned", { port: n, protocol }),
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("allocations.addPortFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onMakePrimary(a: PortAllocation) {
    if (!canUpdate || a.isPrimary) return;
    if (
      !window.confirm(
        t("allocations.makePrimaryConfirm", {
          port: a.port,
          protocol: a.protocol,
        }),
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
        t("allocations.noticePrimary", {
          port: a.port,
          udp: alsoUdp ? t("allocations.noticePrimaryUdp") : "",
        }),
      );
      onPrimaryChanged?.();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("allocations.setPrimaryFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(a: PortAllocation) {
    if (!canDelete || a.isPrimary) return;
    if (!window.confirm(t("allocations.removeConfirm", { port: a.port, protocol: a.protocol }))) {
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.deleteAllocation(serverId, a.id);
      onNotice(t("allocations.noticeRemoved", { port: a.port }));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("allocations.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div className="databases-panel">
      <header className="databases-panel-header">
        <h2 className="databases-panel-title">{t("allocations.title")}</h2>
        <p className="databases-panel-lead mb-0">{t("allocations.lead")}</p>
      </header>

      <Alert variant="warning" className="mb-3">
        <strong>{t("allocations.restartRequired")}</strong>{" "}
        {t("allocations.restartHelp")}
      </Alert>

      {showGeyser && (
        <Alert variant="light" className="border mb-3">
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-mobile-screen me-2" />
            {t("allocations.geyserTitle")}
          </div>
          <p className="small text-secondary mb-2">{t("allocations.geyserHelp")}</p>
          <Button
            size="sm"
            variant="outline-primary"
            disabled={geyserBusy}
            onClick={() => void installGeyser()}
          >
            {geyserBusy ? <Spinner size="sm" /> : t("allocations.geyserInstall")}
          </Button>
        </Alert>
      )}

      <Row className="g-3 databases-layout">
        <Col xs={12} lg={8}>
          <section className="databases-section h-100">
            <h3 className="databases-section-title">{t("allocations.assigned")}</h3>
            {allocations.length === 0 ? (
              <p className="databases-empty mb-0">{t("allocations.empty")}</p>
            ) : (
              <div className="table-responsive">
                <Table hover size="sm" className="align-middle mb-0 databases-table">
                  <thead>
                    <tr>
                      <th>{t("allocations.ip")}</th>
                      <th>{t("allocations.port")}</th>
                      <th>{t("allocations.protocol")}</th>
                      <th>{t("allocations.notes")}</th>
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
                              {t("allocations.primary")}
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
                              {t("allocations.makePrimary")}
                            </Button>
                          )}
                          {canDelete && !a.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={busy}
                              onClick={() => void onRemove(a)}
                            >
                              {t("common.remove")}
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
              <h3 className="databases-section-title">{t("allocations.assignPort")}</h3>
              {free.length > 0 && (
                <Form onSubmit={onAssignFree} className="mb-3">
                  <Form.Label className="small">{t("allocations.fromPool")}</Form.Label>
                  <Form.Select
                    size="sm"
                    value={pickId}
                    onChange={(e) => setPickId(e.target.value)}
                    className="mb-2"
                  >
                    <option value="">{t("allocations.selectFree")}</option>
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
                    {t("allocations.assign")}
                  </Button>
                </Form>
              )}
              <Form onSubmit={onCreatePort}>
                <Form.Label className="small">{t("allocations.createByPort")}</Form.Label>
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
                    label={t("allocations.alsoUdpSamePort")}
                    checked={alsoUdp}
                    onChange={(e) => setAlsoUdp(e.target.checked)}
                  />
                )}
                <Button type="submit" size="sm" disabled={busy} variant="primary">
                  {t("allocations.add")}
                </Button>
              </Form>
              <Form.Check
                type="checkbox"
                className="small mt-3"
                label={t("allocations.alsoUdpPrimary")}
                checked={alsoUdp}
                onChange={(e) => setAlsoUdp(e.target.checked)}
              />
              <Alert variant="light" className="small mt-3 mb-0 border">
                {t("allocations.primaryHelp")}
              </Alert>
            </section>
          </Col>
        )}
      </Row>
    </div>
  );
}
