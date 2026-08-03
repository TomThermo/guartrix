import { useCallback, useState } from "react";
import type { DiskUsageBreakdown, ServerStats } from "@msm/shared";
import { Card, Col, ProgressBar, Row } from "react-bootstrap";
import { api } from "../api";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { useI18n } from "../i18n/react";
import { DiskUsageCard } from "./DiskUsageCard";

interface Props {
  serverId: string;
  active: boolean;
  diskMb?: number;
}

export function ResourceMeter({ serverId, active, diskMb }: Props) {
  const { t } = useI18n();
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
          {t("resources.startToSeeLive")}
        </Card>
      )}

      {active && !stats?.running && (
        <Card body className="text-muted mb-0">
          {t("resources.collectingLive")}
        </Card>
      )}

      {active && stats?.running && (
        <Row xs={1} md={2} lg={3} className="g-3">
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">{t("resources.cpu")}</div>
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
                <div className="text-muted small">{t("resources.memory")}</div>
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
                <div className="text-muted small">{t("resources.networkRx")}</div>
                <div className="fs-5 fw-semibold">{stats.networkRxLabel}</div>
                <div className="small text-muted">{t("resources.inboundTraffic")}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">{t("resources.networkTx")}</div>
                <div className="fs-5 fw-semibold">{stats.networkTxLabel}</div>
                <div className="small text-muted">{t("resources.outboundTraffic")}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">{t("resources.diskRead")}</div>
                <div className="fs-5 fw-semibold">{stats.blockReadLabel}</div>
              </Card.Body>
            </Card>
          </Col>
          <Col>
            <Card>
              <Card.Body>
                <div className="text-muted small">{t("resources.diskWrite")}</div>
                <div className="fs-5 fw-semibold">{stats.blockWriteLabel}</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
