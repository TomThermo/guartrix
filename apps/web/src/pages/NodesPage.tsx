import { useCallback, useEffect, useState } from "react";
import type { DaemonNode } from "@guartrix/shared";
import { Alert, Badge, Button } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { AddNodeModal } from "../components/AddNodeModal";
import { AdminInsetCard, AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { NodesTable } from "../components/admin/NodesTable";
import { NodeEditModal, NodeTokenAlert } from "../components/admin/NodeEditModal";

export function NodesPage() {
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

  const editNode = editNodeId ? (nodes.find((n) => n.id === editNodeId) ?? null) : null;

  return (
    <AdminPageShell
      title={t("admin.nodesPageTitle")}
      subtitle={t("admin.nodesPageSubtitle")}
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
      {newToken && <NodeTokenAlert token={newToken} onDismiss={() => setNewToken(null)} />}

      {nodes.length === 0 && !error ? (
        <Alert variant="info" className="mb-3">
          {t("admin.noNodesHint")}
        </Alert>
      ) : (
        <AdminPanelCard title={t("admin.nodesTitle", { count: nodes.length })} icon="fa-server">
          <AdminInsetCard className="p-0 overflow-auto">
            <NodesTable nodes={nodes} onOpenNode={(n) => setEditNodeId(n.id)} />
          </AdminInsetCard>
          <p className="small text-secondary mb-0 mt-2">{t("admin.nodesTableHint")}</p>
        </AdminPanelCard>
      )}

      <AdminPanelCard title={t("admin.howAddNode")} icon="fa-circle-info" className="mt-3">
        <ol className="small mb-3 ps-3">
          <li>{t("admin.howAddStep1")}</li>
          <li>{t("admin.howAddStep2")}</li>
          <li>{t("admin.howAddStep3")}</li>
          <li>
            {t("admin.howAddStep4")} <Badge bg="success">ONLINE</Badge>
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
