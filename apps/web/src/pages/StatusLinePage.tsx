import { useState } from "react";
import { Button, Nav, Tab } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { AdminPageShell } from "../components/admin/AdminPageShell";
import { SystemLogsPanel } from "../components/SystemLogsPanel";
import { StatusLineNodeCard } from "../components/status-line/StatusLineNodeCard";
import { StatusLineOverview } from "../components/status-line/StatusLineSummary";
import { STATUS_REFRESH_MS, useAdminStatus } from "../components/status-line/useAdminStatus";

type StatusTab = "overview" | "nodes" | "logs";

export function StatusLinePage() {
  const { t } = useI18n();
  const { data, loading, error, setError, refresh } = useAdminStatus(STATUS_REFRESH_MS);
  const [tab, setTab] = useState<StatusTab>("overview");

  return (
    <AdminPageShell
      title={t("admin.statusTitle")}
      subtitle={`${t("admin.statusSubtitle")} ${t("admin.statusRefreshHint", {
        seconds: String(Math.round(STATUS_REFRESH_MS / 1000)),
      })}`}
      icon="fa-heart-pulse"
      className="status-page"
      error={error}
      onDismissError={() => setError(null)}
      loading={loading && !data}
      loadingLabel={t("common.loading")}
      extraHeader={
        <div className="d-flex align-items-center gap-2">
          {data && (
            <div className="small text-secondary">
              {t("admin.statusUpdated", {
                time: new Date(data.generatedAt).toLocaleTimeString(),
              })}
            </div>
          )}
          <Button size="sm" variant="outline-secondary" onClick={() => void refresh(true)}>
            <i className="fa-solid fa-rotate me-1" aria-hidden />
            {t("common.refresh")}
          </Button>
        </div>
      }
    >
      <Tab.Container activeKey={tab} onSelect={(k) => setTab((k as StatusTab) || "overview")}>
        <Nav variant="pills" className="status-page__tabs gap-1 mb-3 flex-wrap">
          <Nav.Item>
            <Nav.Link eventKey="overview">
              <i className="fa-solid fa-gauge-high me-1" aria-hidden />
              {t("admin.statusTabOverview")}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="nodes">
              <i className="fa-solid fa-network-wired me-1" aria-hidden />
              {t("admin.statusTabNodes")}
              {data ? <span className="admin-shell__count ms-2">{data.nodes.length}</span> : null}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="logs">
              <i className="fa-solid fa-terminal me-1" aria-hidden />
              {t("admin.statusTabLogs")}
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey="overview" mountOnEnter>
            {data ? <StatusLineOverview data={data} /> : null}
          </Tab.Pane>
          <Tab.Pane eventKey="nodes" mountOnEnter>
            <div className="status-nodes">
              {data?.nodes.map((node) => (
                <StatusLineNodeCard key={node.id} node={node} />
              ))}
              {data && data.nodes.length === 0 ? (
                <section className="admin-inset-card">
                  <p className="small text-secondary mb-0">{t("admin.statusNoNodes")}</p>
                </section>
              ) : null}
            </div>
          </Tab.Pane>
          <Tab.Pane eventKey="logs" mountOnEnter unmountOnExit>
            {data ? <SystemLogsPanel nodes={data.nodes} /> : null}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </AdminPageShell>
  );
}
