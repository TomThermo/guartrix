import { useCallback, useState } from "react";
import type { DiskUsageBreakdown, ServerStats } from "@msm/shared";
import { Card, Col, ProgressBar, Row } from "react-bootstrap";
import { api } from "../api";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { DiskUsageCard } from "./DiskUsageCard";

interface Props {
  serverId: string;
  active: boolean;
  diskMb?: number;
}

export function ResourceMeter({ serverId, active, diskMb }: Props) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [disk, setDisk] = useState<DiskUsageBreakdown | null>(null);

  const loadDisk = useCallback(async () => {
    try {
      const next = await api.getDiskUsage(serverId);
      setDisk(next);
    } catch {
      // fall back to stats.disk if available
    }
  }, [serverId]);

  useVisibleInterval(() => void loadDisk(), 30_000, true);

  useVisibleInterval(
    () => {
      void (async () => {
        try {
          const next = await api.getStats(serverId);
          setStats(next);
          if (next.disk) setDisk(next.disk);
        } catch {
          setStats(null);
        }
      })();
    },
    8_000,
    active,
  );

  return (
    <div>
      {disk && <DiskUsageCard disk={disk} limitMb={diskMb} />}

      {!active && (
        <Card body className="text-muted mb-0">
          Start the server to see live CPU, memory and network usage. Disk breakdown above is
          available while stopped.
        </Card>
      )}

      {active && !stats?.running && (
        <Card body className="text-muted mb-0">
          Collecting live usage…
        </Card>
      )}

      {active && stats?.running && (
        <Row xs={1} md={2} lg={3} className="g-3">
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">CPU</div>
                <div className="fs-4 fw-semibold">
                  {Math.min(100, stats.cpuPercent).toFixed(1)}%
                </div>
                <ProgressBar now={Math.min(100, stats.cpuPercent)} className="mt-2" />
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">Memory</div>
                <div className="fs-5 fw-semibold">
                  {stats.memoryUsedLabel}
                  <span className="text-muted fs-6"> / {stats.memoryLimitLabel}</span>
                </div>
                <ProgressBar now={Math.min(100, stats.memoryPercent)} className="mt-2" />
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">Network RX</div>
                <div className="fs-5 fw-semibold">{stats.networkRxLabel}</div>
                <div className="small text-muted">Inbound traffic</div>
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">Network TX</div>
                <div className="fs-5 fw-semibold">{stats.networkTxLabel}</div>
                <div className="small text-muted">Outbound traffic</div>
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">Disk read</div>
                <div className="fs-5 fw-semibold">{stats.blockReadLabel}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">Disk write</div>
                <div className="fs-5 fw-semibold">{stats.blockWriteLabel}</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
