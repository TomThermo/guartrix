import { Alert, Button, Col, Row, Spinner } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { SystemLogsPanel } from "../components/SystemLogsPanel";
import { StatusLineNodeCard } from "../components/status-line/StatusLineNodeCard";
import {
  StatusLineArchitectureCard,
  StatusLineGameNodeSummary,
  StatusLinePanelCards,
  StatusLineVersionCard,
} from "../components/status-line/StatusLineSummary";
import { STATUS_REFRESH_MS, useAdminStatus } from "../components/status-line/useAdminStatus";

export function StatusLinePage() {
  const { t } = useI18n();
  const { data, loading, error, setError, refresh } = useAdminStatus(STATUS_REFRESH_MS);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  const panel = data?.panel;
  const apiInfo = panel?.api;

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">{t("admin.statusTitle")}</h1>
          <p className="text-secondary mb-0 small">
            {t("admin.statusSubtitle")} Refreshes every {Math.round(STATUS_REFRESH_MS / 1000)}s.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {data && (
            <div className="small text-secondary">
              Updated {new Date(data.generatedAt).toLocaleTimeString()}
            </div>
          )}
          <Button size="sm" variant="outline-secondary" onClick={() => void refresh(true)}>
            <i className="fa-solid fa-rotate me-1" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <StatusLineArchitectureCard />

      {panel?.version && <StatusLineVersionCard version={panel.version} />}

      <StatusLinePanelCards panel={panel} apiInfo={apiInfo} />

      {data && <StatusLineGameNodeSummary data={data} />}

      <div className="small text-secondary text-uppercase mb-2">Per node</div>
      <Row className="g-3">
        {data?.nodes.map((node) => (
          <Col key={node.id} xs={12}>
            <StatusLineNodeCard node={node} />
          </Col>
        ))}
      </Row>

      {data && <SystemLogsPanel nodes={data.nodes} />}
    </div>
  );
}
