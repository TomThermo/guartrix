import type { DaemonNode } from "@guartrix/shared";
import { Button, Spinner } from "react-bootstrap";
import { useI18n } from "../../../i18n/react";
import { formatGb } from "../../../utils";
import { NodeLiveStats } from "../NodeLiveStats";

export type NodeOverviewPanelProps = {
  node: DaemonNode;
  busy: boolean;
  tabActive: boolean;
  ramPct: number;
  onTest: () => void;
  onInstall: (node: DaemonNode) => void;
  onRegenerate: () => void;
  onDelete: () => void;
};

export function NodeOverviewPanel({
  node,
  busy,
  tabActive,
  ramPct,
  onTest,
  onInstall,
  onRegenerate,
  onDelete,
}: NodeOverviewPanelProps) {
  const { t } = useI18n();

  return (
    <div className="node-overview">
      <section className="admin-inset-card node-overview__actions">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h2 className="admin-section-title mb-0">
            <i className="fa-solid fa-gears" aria-hidden />
            {t("admin.nodeActions")}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void onTest()}>
              {busy ? (
                <Spinner size="sm" animation="border" />
              ) : (
                <>
                  <i className="fa-solid fa-heart-pulse me-1" aria-hidden />
                  {t("admin.testConnection")}
                </>
              )}
            </Button>
            {!node.isLocal && (
              <Button
                size="sm"
                variant="outline-primary"
                disabled={busy}
                onClick={() => onInstall(node)}
              >
                <i className="fa-solid fa-download me-1" aria-hidden />
                {t("admin.installDaemon")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={busy}
              onClick={() => void onRegenerate()}
            >
              <i className="fa-solid fa-key me-1" aria-hidden />
              {t("admin.newToken")}
            </Button>
            {!node.isLocal && (
              <Button
                size="sm"
                variant="outline-danger"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                <i className="fa-solid fa-trash me-1" aria-hidden />
                {t("common.delete")}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-circle-info" aria-hidden />
          {t("admin.nodeInformation")}
        </h2>
        <div className="node-info-tiles">
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeType")}</div>
            <div className="node-meta-tile__value">
              {node.isLocal ? t("admin.nodeLocal") : t("admin.nodeRemote")}
            </div>
          </div>
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeLocation")}</div>
            <div className="node-meta-tile__value">{node.location || "—"}</div>
          </div>
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeServers")}</div>
            <div className="node-meta-tile__value">{node.serverCount}</div>
          </div>
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeRam")}</div>
            <div className="node-meta-tile__value">
              {node.memoryMb > 0
                ? `${formatGb(node.memoryUsedMb)} / ${formatGb(node.memoryMb)}`
                : "—"}
            </div>
            {node.memoryMb > 0 ? (
              <div className="node-meta-tile__hint">
                {ramPct}% {t("admin.nodeAllocated")}
              </div>
            ) : null}
          </div>
          <div className="node-meta-tile node-meta-tile--wide">
            <div className="node-meta-tile__label">{t("admin.nodeAddress")}</div>
            <div className="node-meta-tile__value font-monospace small">{node.publicUrl}</div>
          </div>
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">SFTP</div>
            <div className="node-meta-tile__value font-monospace small">
              {node.sftpDisplayHost
                ? `${node.sftpDisplayHost}:${node.sftpPort}`
                : node.sftpHostname
                  ? `${node.sftpHostname}:${node.sftpPort}`
                  : "—"}
            </div>
          </div>
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeLastSeen")}</div>
            <div className="node-meta-tile__value small">
              {node.lastSeenAt ? new Date(node.lastSeenAt).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-microchip" aria-hidden />
          {t("admin.nodeLiveTitle")}
        </h2>
        <NodeLiveStats nodeId={node.id} active={tabActive} />
      </section>
    </div>
  );
}
