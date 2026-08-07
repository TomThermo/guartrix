import { useCallback, useEffect, useState } from "react";
import type { DaemonNode } from "@msm/shared";
import { Alert, Badge, Button, Table } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { AddNodeModal } from "../components/AddNodeModal";
import {
  AdminInsetCard,
  AdminPageShell,
  AdminPanelCard,
} from "../components/admin/AdminPageShell";
import {
  NodeEditModal,
  NodeTokenAlert,
  useNodeReachable,
} from "../components/admin/NodeEditModal";
import { formatGb } from "../utils";

function healthKind(
  status: DaemonNode["status"],
): "online" | "offline" | "unknown" {
  if (status === "ONLINE") return "online";
  if (status === "OFFLINE") return "offline";
  return "unknown";
}

function StatusGlyph({
  kind,
  title,
}: {
  kind: "online" | "offline" | "unknown" | "loading" | "ssl" | "http" | "public" | "local";
  title: string;
}) {
  const map: Record<typeof kind, { icon: string; className: string }> = {
    online: { icon: "fa-circle-check", className: "text-success" },
    offline: { icon: "fa-ban", className: "text-danger" },
    unknown: { icon: "fa-triangle-exclamation", className: "text-warning" },
    loading: { icon: "fa-rotate fa-spin", className: "text-secondary" },
    ssl: { icon: "fa-lock", className: "text-success" },
    http: { icon: "fa-lock-open", className: "text-warning" },
    public: { icon: "fa-globe", className: "text-success" },
    local: { icon: "fa-server", className: "text-secondary" },
  };
  const cfg = map[kind];
  return (
    <i
      className={`fa-solid ${cfg.icon} ${cfg.className} nodes-table__icon`}
      title={title}
      aria-label={title}
    />
  );
}

function NodeReachableCell({ url }: { url: string }) {
  const { t } = useI18n();
  const status = useNodeReachable(url);
  if (status === "loading") {
    return <StatusGlyph kind="loading" title={t("admin.reachableChecking")} />;
  }
  if (status === "online") {
    return <StatusGlyph kind="online" title={t("admin.reachableYes")} />;
  }
  return <StatusGlyph kind="offline" title={t("admin.reachableNo")} />;
}

function NodeRow({
  node,
  onOpen,
}: {
  node: DaemonNode;
  onOpen: (node: DaemonNode) => void;
}) {
  const { t } = useI18n();
  const health = healthKind(node.status);
  const ssl = node.scheme === "https";
  const ramLabel =
    node.memoryMb > 0
      ? `${formatGb(node.memoryUsedMb)} / ${formatGb(node.memoryMb)}`
      : "—";

  return (
    <tr className="nodes-table__row" onClick={() => onOpen(node)}>
      <td className="text-center">
        <StatusGlyph
          kind={health}
          title={
            health === "online"
              ? t("admin.healthOnline")
              : health === "offline"
                ? t("admin.healthOffline")
                : t("admin.healthUnknown")
          }
        />
      </td>
      <td className="text-center" onClick={(e) => e.stopPropagation()}>
        <NodeReachableCell url={node.publicUrl} />
      </td>
      <td>
        <div className="fw-semibold">{node.name}</div>
        {node.location ? (
          <div className="small text-secondary text-truncate">{node.location}</div>
        ) : null}
      </td>
      <td className="font-monospace small text-secondary d-none d-md-table-cell">
        {node.fqdn}
        {node.daemonPort !== 443 && node.daemonPort !== 80
          ? `:${node.daemonPort}`
          : ""}
      </td>
      <td className="text-center d-none d-xl-table-cell">
        <StatusGlyph
          kind={ssl ? "ssl" : "http"}
          title={
            ssl
              ? node.behindProxy
                ? t("admin.nodeSslHttpsProxy")
                : t("admin.sslYes")
              : t("admin.sslNo")
          }
        />
      </td>
      <td className="text-center d-none d-lg-table-cell">
        <StatusGlyph
          kind={node.isLocal ? "local" : "public"}
          title={node.isLocal ? t("admin.nodeLocal") : t("admin.nodeRemote")}
        />
      </td>
      <td className="text-center d-none d-sm-table-cell">{node.serverCount}</td>
      <td className="small text-secondary d-none d-lg-table-cell">{ramLabel}</td>
      <td className="text-end" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline-primary"
          aria-label={t("admin.editNode")}
          onClick={() => onOpen(node)}
        >
          <i className="fa-solid fa-pen" aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

export function SystemSettingsPage() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<DaemonNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [installNode, setInstallNode] = useState<DaemonNode | null>(null);

  const refresh = useCallback(async () => {
    const { nodes: list } = await api.listAdminNodes();
    setNodes(list);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [refresh]);

  const editNode = editNodeId
    ? (nodes.find((n) => n.id === editNodeId) ?? null)
    : null;

  return (
    <AdminPageShell
      title={t("admin.systemTitle")}
      subtitle={t("admin.systemSubtitle")}
      icon="fa-network-wired"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={loading}
      loadingLabel={t("common.loading")}
      extraHeader={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setInstallNode(null);
            setShowAddModal(true);
          }}
        >
          <i className="fa-solid fa-plus me-1" aria-hidden />
          <span className="btn-label">{t("admin.addNode")}</span>
        </Button>
      }
    >
      {newToken && (
        <NodeTokenAlert token={newToken} onDismiss={() => setNewToken(null)} />
      )}

      {nodes.length === 0 && !error ? (
        <Alert variant="info" className="mb-3">
          {t("admin.noNodesHint")}
        </Alert>
      ) : (
        <AdminPanelCard
          title={t("admin.nodesTitle", { count: nodes.length })}
          icon="fa-server"
        >
          <AdminInsetCard className="p-0 overflow-auto">
            <Table hover responsive className="mb-0 align-middle nodes-table">
              <thead>
                <tr>
                  <th className="text-center" style={{ width: "3rem" }}>
                    {t("admin.colHealth")}
                  </th>
                  <th className="text-center" style={{ width: "3rem" }}>
                    {t("admin.colReachable")}
                  </th>
                  <th>{t("admin.colName")}</th>
                  <th className="d-none d-md-table-cell">{t("admin.colAddress")}</th>
                  <th className="text-center d-none d-xl-table-cell">
                    {t("admin.colSsl")}
                  </th>
                  <th className="text-center d-none d-lg-table-cell">
                    {t("admin.colType")}
                  </th>
                  <th className="text-center d-none d-sm-table-cell">
                    {t("admin.colServers")}
                  </th>
                  <th className="d-none d-lg-table-cell">{t("admin.colRam")}</th>
                  <th style={{ width: "3.5rem" }} />
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <NodeRow
                    key={node.id}
                    node={node}
                    onOpen={(n) => setEditNodeId(n.id)}
                  />
                ))}
              </tbody>
            </Table>
          </AdminInsetCard>
          <p className="small text-secondary mb-0 mt-2">{t("admin.nodesTableHint")}</p>
        </AdminPanelCard>
      )}

      <AdminPanelCard title={t("admin.howAddNode")} icon="fa-circle-info" className="mt-3">
        <ol className="small mb-3 ps-3">
          <li>
            {t("admin.howAddStep1")}
          </li>
          <li>
            {t("admin.howAddStep2")}
          </li>
          <li>
            {t("admin.howAddStep3")}
          </li>
          <li>
            {t("admin.howAddStep4")}{" "}
            <Badge bg="success">ONLINE</Badge>
          </li>
        </ol>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setInstallNode(null);
            setShowAddModal(true);
          }}
        >
          <i className="fa-solid fa-plus me-2" aria-hidden />
          {t("admin.addNode")}
        </Button>
      </AdminPanelCard>

      {editNode && (
        <NodeEditModal
          node={editNode}
          busy={busyId === editNode.id}
          onBusy={setBusyId}
          onClose={() => setEditNodeId(null)}
          onChanged={refresh}
          onInstall={(n) => {
            setEditNodeId(null);
            setShowAddModal(false);
            setInstallNode(n);
          }}
          onError={setError}
          onNotice={setNotice}
          onNewToken={setNewToken}
        />
      )}

      {(showAddModal || installNode) && (
        <AddNodeModal
          key={installNode?.id ?? "new"}
          existingNode={installNode}
          onClose={() => {
            setShowAddModal(false);
            setInstallNode(null);
          }}
          onChanged={refresh}
        />
      )}
    </AdminPageShell>
  );
}
