import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PortAllocation } from "@msm/shared";
import {
  Badge,
  Button,
  Form,
  Spinner,
  Stack,
  Table,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  nodeId: string;
  nodeName: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

export function NodePortPoolPanel({
  nodeId,
  nodeName,
  onError,
  onNotice,
}: Props) {
  const { t } = useI18n();
  const [allocations, setAllocations] = useState<PortAllocation[]>([]);
  const [assigned, setAssigned] = useState(0);
  const [free, setFree] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [portStart, setPortStart] = useState("25565");
  const [portEnd, setPortEnd] = useState("25575");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [alsoUdp, setAlsoUdp] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.adminListNodeAllocations(nodeId);
    setAllocations(data.allocations);
    setAssigned(data.assigned);
    setFree(data.free);
  }, [nodeId]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) =>
        onError(err instanceof Error ? err.message : t("admin.loadPortPoolFailed")),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError, t]);

  async function onCreateRange(e: FormEvent) {
    e.preventDefault();
    const start = Number(portStart);
    const end = Number(portEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      onError(t("admin.validPorts"));
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.adminCreateNodeAllocations(nodeId, {
        portStart: start,
        portEnd: end,
        protocol,
      });
      if (alsoUdp && protocol === "tcp") {
        await api.adminCreateNodeAllocations(nodeId, {
          portStart: start,
          portEnd: end,
          protocol: "udp",
        });
      }
      onNotice(
        t("admin.createRangeNotice", {
          created: result.created,
          node: nodeName,
          skipped: result.skipped
            ? t("admin.createRangeSkipped", { skipped: result.skipped })
            : "",
        }),
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("admin.createRangeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(a: PortAllocation) {
    if (a.serverId) {
      onError(t("admin.unassignFirst"));
      return;
    }
    if (
      !confirm(
        t("admin.deletePoolConfirm", {
          port: a.port,
          protocol: a.protocol,
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await api.adminDeleteNodeAllocation(nodeId, a.id);
      onNotice(t("admin.poolEntryDeleted"));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-secondary small py-2">
        <Spinner size="sm" className="me-2" />
        {t("admin.loadingPortPool")}
      </div>
    );
  }

  return (
    <div className="mt-3 border-top pt-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <strong className="small">{t("admin.portPool")}</strong>
        <span className="small text-secondary">
          {t("admin.portPoolStats", {
            free,
            assigned,
            total: allocations.length,
          })}
        </span>
      </div>

      <Form onSubmit={(e) => void onCreateRange(e)} className="mb-3">
        <Stack direction="horizontal" gap={2} className="flex-wrap align-items-end">
          <Form.Group>
            <Form.Label className="small mb-0">{t("admin.portFrom")}</Form.Label>
            <Form.Control
              size="sm"
              type="number"
              style={{ width: "6rem" }}
              value={portStart}
              onChange={(e) => setPortStart(e.target.value)}
              required
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small mb-0">{t("admin.portTo")}</Form.Label>
            <Form.Control
              size="sm"
              type="number"
              style={{ width: "6rem" }}
              value={portEnd}
              onChange={(e) => setPortEnd(e.target.value)}
              required
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small mb-0">{t("admin.protocol")}</Form.Label>
            <Form.Select
              size="sm"
              value={protocol}
              onChange={(e) =>
                setProtocol(e.target.value === "udp" ? "udp" : "tcp")
              }
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </Form.Select>
          </Form.Group>
          {protocol === "tcp" && (
            <Form.Check
              type="checkbox"
              className="small"
              label={t("admin.alsoUdp")}
              checked={alsoUdp}
              onChange={(e) => setAlsoUdp(e.target.checked)}
            />
          )}
          <Button type="submit" size="sm" variant="outline-primary" disabled={busy}>
            {t("admin.addRange")}
          </Button>
        </Stack>
      </Form>

      {allocations.length === 0 ? (
        <p className="small text-secondary mb-0">{t("admin.noPoolEntries")}</p>
      ) : (
        <div className="table-responsive" style={{ maxHeight: "14rem" }}>
          <Table size="sm" hover className="mb-0 align-middle">
            <thead>
              <tr className="text-secondary">
                <th>{t("admin.portCol")}</th>
                <th>{t("admin.protoCol")}</th>
                <th>{t("admin.statusCol")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>
                    <code>{a.port}</code>
                  </td>
                  <td>{a.protocol.toUpperCase()}</td>
                  <td>
                    {a.serverId ? (
                      <Badge bg="secondary">
                        {a.serverName ?? t("admin.assignedStatus")}
                      </Badge>
                    ) : (
                      <Badge bg="success">{t("admin.freeStatus")}</Badge>
                    )}
                  </td>
                  <td className="text-end">
                    {!a.serverId && (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={busy}
                        onClick={() => void onDelete(a)}
                      >
                        {t("common.delete")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
