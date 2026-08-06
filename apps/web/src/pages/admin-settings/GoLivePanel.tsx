import { useCallback } from "react";
import { Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import { AdminInsetCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import type { MessageKey } from "../../i18n";
import type { ReadinessReport } from "../../api/admin-settings";

const READINESS_LABELS: Record<string, MessageKey> = {
  invite_email_verified: "adminSettings.readiness.invite_email_verified",
  smtp: "adminSettings.readiness.smtp",
  registration: "adminSettings.readiness.registration",
  https_session: "adminSettings.readiness.https_session",
  trust_proxy: "adminSettings.readiness.trust_proxy",
  admin_2fa: "adminSettings.readiness.admin_2fa",
  redis: "adminSettings.readiness.redis",
  alerts: "adminSettings.readiness.alerts",
  daemon_jwt_legacy: "adminSettings.readiness.daemon_jwt_legacy",
  scheduler_locks: "adminSettings.readiness.scheduler_locks",
  jobs: "adminSettings.readiness.jobs",
  sla_restore_drill: "adminSettings.readiness.sla_restore_drill",
  sla_incident_runbook: "adminSettings.readiness.sla_incident_runbook",
  sla_pentest: "adminSettings.readiness.sla_pentest",
};

export type GoLivePanelProps = {
  readiness: ReadinessReport | null;
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
  slaRestoreDrillAt: string;
  onSlaRestoreDrillAtChange: (v: string) => void;
  slaCapacityReviewAt: string;
  onSlaCapacityReviewAtChange: (v: string) => void;
  slaIncidentRunbookAck: boolean;
  onSlaIncidentRunbookAckChange: (v: boolean) => void;
  slaPentestAck: boolean;
  onSlaPentestAckChange: (v: boolean) => void;
  onGoToTab: (tab: "general" | "mail" | "security" | "alerts") => void;
};

function toneVariant(
  tone: string,
): "success" | "warning" | "danger" | "secondary" | "info" {
  if (tone === "pass") return "success";
  if (tone === "warn") return "warning";
  if (tone === "fail") return "danger";
  if (tone === "info") return "info";
  return "secondary";
}

export function GoLivePanel({
  readiness,
  loading,
  busy,
  onRefresh,
  slaRestoreDrillAt,
  onSlaRestoreDrillAtChange,
  slaCapacityReviewAt,
  onSlaCapacityReviewAtChange,
  slaIncidentRunbookAck,
  onSlaIncidentRunbookAckChange,
  slaPentestAck,
  onSlaPentestAckChange,
  onGoToTab,
}: GoLivePanelProps) {
  const { t } = useI18n();

  const labelFor = useCallback(
    (id: string) => {
      const key = READINESS_LABELS[id];
      return key ? t(key) : id;
    },
    [t],
  );

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="fw-semibold">{t("adminSettings.goLiveHeading")}</div>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={busy || loading}
          onClick={onRefresh}
        >
          {loading ? <Spinner size="sm" /> : t("adminSettings.goLiveRefresh")}
        </Button>
        {readiness && (
          <span className="small text-secondary">
            {t("adminSettings.goLiveSummary", {
              pass: String(readiness.summary.pass),
              warn: String(readiness.summary.warn),
              fail: String(readiness.summary.fail),
            })}
          </span>
        )}
      </div>
      <p className="small text-secondary mb-3">
        {t("adminSettings.goLiveHelp")}
      </p>

      {loading && !readiness ? (
        <div className="text-secondary small">{t("common.loading")}</div>
      ) : readiness ? (
        <Table responsive size="sm" className="align-middle mb-4">
          <thead>
            <tr>
              <th>{t("adminSettings.goLiveColStatus")}</th>
              <th>{t("adminSettings.goLiveColCheck")}</th>
              <th>{t("adminSettings.goLiveColDetail")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {readiness.checks.map((c) => (
              <tr key={c.id}>
                <td>
                  <Badge bg={toneVariant(c.tone)}>{c.tone}</Badge>
                </td>
                <td className="fw-semibold">{labelFor(c.id)}</td>
                <td className="small text-secondary">{c.detail ?? "—"}</td>
                <td className="text-end">
                  {c.tab && c.tab !== "golive" ? (
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0"
                      onClick={() => {
                        if (
                          c.tab === "general" ||
                          c.tab === "mail" ||
                          c.tab === "security" ||
                          c.tab === "alerts"
                        ) {
                          onGoToTab(c.tab);
                        }
                      }}
                    >
                      {t("adminSettings.goLiveFix")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {readiness?.jobs && (
        <AdminInsetCard className="mb-4">
          <div className="fw-semibold mb-1">
            {t("adminSettings.goLiveJobs")}
          </div>
          <p className="small text-secondary mb-2">
            {readiness.jobs.mode === "bullmq"
              ? t("adminSettings.goLiveJobsBullmq")
              : t("adminSettings.goLiveJobsInProcess")}
          </p>
          {readiness.jobs.queues && readiness.jobs.queues.length > 0 && (
            <Table size="sm" responsive className="mb-0">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Waiting</th>
                  <th>Active</th>
                  <th>Failed</th>
                  <th>Delayed</th>
                </tr>
              </thead>
              <tbody>
                {readiness.jobs.queues.map((q) => (
                  <tr key={q.name}>
                    <td className="font-monospace">{q.name}</td>
                    <td>{q.waiting}</td>
                    <td>{q.active}</td>
                    <td>{q.failed}</td>
                    <td>{q.delayed}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </AdminInsetCard>
      )}

      <AdminInsetCard>
        <div className="fw-semibold mb-2">
          {t("adminSettings.slaAttestHeading")}
        </div>
        <p className="small text-secondary mb-3">
          {t("adminSettings.slaAttestHelp")}
        </p>
        <Form.Group className="mb-3">
          <Form.Label>{t("adminSettings.slaRestoreDrill")}</Form.Label>
          <Form.Control
            type="date"
            value={slaRestoreDrillAt}
            onChange={(e) => onSlaRestoreDrillAtChange(e.target.value)}
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>{t("adminSettings.slaCapacityReview")}</Form.Label>
          <Form.Control
            type="date"
            value={slaCapacityReviewAt}
            onChange={(e) => onSlaCapacityReviewAtChange(e.target.value)}
          />
        </Form.Group>
        <Form.Check
          type="checkbox"
          id="sla-incident-ack"
          className="mb-2"
          label={t("adminSettings.slaIncidentAck")}
          checked={slaIncidentRunbookAck}
          onChange={(e) => onSlaIncidentRunbookAckChange(e.target.checked)}
        />
        <Form.Check
          type="checkbox"
          id="sla-pentest-ack"
          label={t("adminSettings.slaPentestAck")}
          checked={slaPentestAck}
          onChange={(e) => onSlaPentestAckChange(e.target.checked)}
        />
      </AdminInsetCard>
    </>
  );
}
