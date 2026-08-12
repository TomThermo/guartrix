import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { DaemonNode } from "@guartrix/shared";
import { Alert, Badge, Button, Form, Modal, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { StoragePool } from "../api/storage-types";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";

function asPools(raw: unknown[]): StoragePool[] {
  return raw as StoragePool[];
}

export function AdminStoragePage() {
  const { t } = useI18n();
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [nodes, setNodes] = useState<DaemonNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"LOCAL" | "NFS">("NFS");
  const [nfsServer, setNfsServer] = useState("127.0.0.1");
  const [nfsExport, setNfsExport] = useState("");
  const [diskMb, setDiskMb] = useState(0);
  const [createNodeId, setCreateNodeId] = useState("");
  const [hostPath, setHostPath] = useState("");
  const [mountPoint, setMountPoint] = useState("");

  const [linkNodeId, setLinkNodeId] = useState("");
  const [linkMount, setLinkMount] = useState("");
  const [linkHost, setLinkHost] = useState("");

  const selected = useMemo(
    () => pools.find((p) => p.id === selectedId) ?? null,
    [pools, selectedId],
  );

  const refresh = useCallback(async () => {
    const [{ storages }, { nodes: nodeList }] = await Promise.all([
      api.adminListStorages(),
      api.listAdminNodes(),
    ]);
    const list = asPools(storages);
    setPools(list);
    setNodes(nodeList);
    setSelectedId((prev) => {
      if (prev && list.some((p) => p.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function run(action: () => Promise<void>, okMsg?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      if (okMsg) setNotice(okMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const { storage } = await api.adminCreateStorage({
        name,
        type,
        diskMb,
        ...(type === "NFS"
          ? { nfsServer, nfsExport, nfsOptions: "vers=4.1,hard,timeo=600,_netdev" }
          : {}),
        ...(createNodeId
          ? {
              nodeId: createNodeId,
              ...(mountPoint.trim() ? { mountPoint: mountPoint.trim() } : {}),
              ...(type === "LOCAL" && hostPath.trim() ? { hostPath: hostPath.trim() } : {}),
            }
          : {}),
      });
      const created = storage as StoragePool;
      setSelectedId(created.id);
      setShowCreate(false);
      setName("");
      setNfsExport("");
      setHostPath("");
      setMountPoint("");
      setCreateNodeId("");
    }, t("admin.storageCreated"));
  }

  const unlinkedNodes = useMemo(() => {
    if (!selected) return nodes;
    const linked = new Set(selected.links.map((l) => l.nodeId));
    return nodes.filter((n) => !linked.has(n.id));
  }, [nodes, selected]);

  return (
    <AdminPageShell
      title={t("admin.storagePageTitle")}
      subtitle={t("admin.storagePageSubtitle")}
      icon="fa-hard-drive"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={loading}
      loadingLabel={t("common.loading")}
      extraHeader={
        <Button variant="primary" onClick={() => setShowCreate(true)} disabled={busy}>
          <i className="fa-solid fa-plus me-1" aria-hidden />
          {t("admin.storageAdd")}
        </Button>
      }
    >
      <div className="row g-3">
        <div className="col-lg-4">
          <AdminPanelCard title={t("admin.storagePools")} icon="fa-database">
            {pools.length === 0 ? (
              <p className="text-secondary mb-0">{t("admin.storageEmpty")}</p>
            ) : (
              <div className="list-group list-group-flush">
                {pools.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`list-group-item list-group-item-action ${selectedId === p.id ? "active" : ""}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <span className="fw-semibold">{p.name}</span>
                      <Badge bg={p.type === "NFS" ? "info" : "secondary"}>{p.type}</Badge>
                    </div>
                    <div className="small opacity-75">
                      {t("admin.storageMeta", {
                        nodes: p.links.length,
                        servers: p.serverCount,
                      })}
                      {!p.enabled ? ` · ${t("admin.storageDisabled")}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </AdminPanelCard>
        </div>

        <div className="col-lg-8">
          {!selected ? (
            <AdminPanelCard title={t("admin.storageDetail")} icon="fa-circle-info">
              <p className="text-secondary mb-0">{t("admin.storagePick")}</p>
            </AdminPanelCard>
          ) : (
            <AdminPanelCard title={selected.name} icon="fa-hard-drive">
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Badge bg={selected.type === "NFS" ? "info" : "secondary"}>{selected.type}</Badge>
                <Badge bg={selected.enabled ? "success" : "secondary"}>
                  {selected.enabled ? t("admin.storageEnabled") : t("admin.storageDisabled")}
                </Badge>
                {selected.type === "NFS" && (
                  <span className="text-secondary small align-self-center">
                    {selected.nfsServer}:{selected.nfsExport}
                  </span>
                )}
                <div className="ms-auto d-flex gap-2">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.adminUpdateStorage(selected.id, {
                          enabled: !selected.enabled,
                        });
                      })
                    }
                  >
                    {selected.enabled ? t("admin.storageDisable") : t("admin.storageEnable")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    disabled={busy || selected.serverCount > 0}
                    onClick={() => {
                      if (!window.confirm(t("admin.storageDeleteConfirm"))) return;
                      void run(async () => {
                        await api.adminDeleteStorage(selected.id);
                        setSelectedId(null);
                      }, t("admin.storageDeleted"));
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              </div>

              <p className="small text-secondary">{t("admin.storageManageHint")}</p>
              <p className="small mb-3">
                <Link to="/admin/nodes">{t("admin.storageGoNodes")}</Link>
              </p>

              <h3 className="h6">{t("admin.storageLinkedNodes")}</h3>
              {selected.links.length === 0 ? (
                <p className="text-secondary">{t("admin.storageNoLinks")}</p>
              ) : (
                <Table responsive size="sm" className="align-middle">
                  <thead>
                    <tr>
                      <th>{t("admin.storageNode")}</th>
                      <th>{t("admin.storageMountPoint")}</th>
                      <th>{t("admin.storageStatus")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.links.map((link) => {
                      const mounted = Boolean(link.status?.mounted);
                      const ready =
                        link.status?.exists &&
                        (selected.type === "LOCAL" &&
                        (!link.hostPath || link.hostPath === link.mountPoint)
                          ? true
                          : mounted);
                      return (
                        <tr key={link.id}>
                          <td>
                            {link.nodeName}
                            <div className="small text-secondary">
                              {link.serverCount} {t("admin.storageServers")}
                            </div>
                          </td>
                          <td className="font-monospace small">{link.mountPoint}</td>
                          <td>
                            <Badge bg={ready ? "success" : "warning"}>
                              {mounted
                                ? t("admin.storageMountedLabel")
                                : t("admin.storageUnmountedLabel")}
                            </Badge>
                          </td>
                          <td className="text-end text-nowrap">
                            <Button
                              size="sm"
                              variant="outline-primary"
                              className="me-1"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await api.adminMountStorageNode(selected.id, link.nodeId);
                                }, t("admin.storageMounted"))
                              }
                            >
                              {t("admin.storageMount")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              className="me-1"
                              disabled={busy || link.serverCount > 0}
                              onClick={() =>
                                void run(async () => {
                                  await api.adminUnmountStorageNode(selected.id, link.nodeId);
                                }, t("admin.storageUnmounted"))
                              }
                            >
                              {t("admin.storageUnmount")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={busy || link.serverCount > 0}
                              onClick={() =>
                                void run(async () => {
                                  await api.adminUnlinkStorageNode(selected.id, link.nodeId);
                                }, t("admin.storageUnlinked"))
                              }
                            >
                              {t("admin.storageUnlink")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}

              {unlinkedNodes.length > 0 && (
                <Form
                  className="border-top pt-3 mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!linkNodeId) return;
                    void run(async () => {
                      await api.adminLinkStorageNode(selected.id, {
                        nodeId: linkNodeId,
                        ...(linkMount.trim() ? { mountPoint: linkMount.trim() } : {}),
                        ...(selected.type === "LOCAL" && linkHost.trim()
                          ? { hostPath: linkHost.trim() }
                          : {}),
                      });
                      setLinkNodeId("");
                      setLinkMount("");
                      setLinkHost("");
                    }, t("admin.storageLinked"));
                  }}
                >
                  <h3 className="h6">{t("admin.storageLinkNode")}</h3>
                  <div className="row g-2 align-items-end">
                    <div className="col-md-4">
                      <Form.Label>{t("admin.storageNode")}</Form.Label>
                      <Form.Select
                        value={linkNodeId}
                        onChange={(e) => setLinkNodeId(e.target.value)}
                        required
                      >
                        <option value="">{t("createServer.chooseNode")}</option>
                        {unlinkedNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                      </Form.Select>
                    </div>
                    <div className="col-md-4">
                      <Form.Label>{t("admin.storageMountPointOptional")}</Form.Label>
                      <Form.Control
                        value={linkMount}
                        onChange={(e) => setLinkMount(e.target.value)}
                        placeholder="/var/lib/guartrix/mounts/…"
                      />
                    </div>
                    {selected.type === "LOCAL" && (
                      <div className="col-md-4">
                        <Form.Label>{t("admin.storageHostPath")}</Form.Label>
                        <Form.Control
                          value={linkHost}
                          onChange={(e) => setLinkHost(e.target.value)}
                          placeholder="/data/games"
                        />
                      </div>
                    )}
                    <div className="col-md-auto">
                      <Button type="submit" disabled={busy || !linkNodeId}>
                        {t("admin.storageLink")}
                      </Button>
                    </div>
                  </div>
                </Form>
              )}
            </AdminPanelCard>
          )}
        </div>
      </div>

      <Modal show={showCreate} onHide={() => !busy && setShowCreate(false)} centered>
        <Form onSubmit={(e) => void onCreate(e)}>
          <Modal.Header closeButton>
            <Modal.Title>{t("admin.storageAdd")}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>{t("admin.storageName")}</Form.Label>
              <Form.Control
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={64}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t("admin.storageType")}</Form.Label>
              <Form.Select
                value={type}
                onChange={(e) => setType(e.target.value as "LOCAL" | "NFS")}
              >
                <option value="NFS">{t("admin.storageTypeNfs")}</option>
                <option value="LOCAL">{t("admin.storageTypeLocal")}</option>
              </Form.Select>
            </Form.Group>
            {type === "NFS" ? (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>{t("admin.storageNfsServer")}</Form.Label>
                  <Form.Control
                    value={nfsServer}
                    onChange={(e) => setNfsServer(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>{t("admin.storageNfsExport")}</Form.Label>
                  <Form.Control
                    value={nfsExport}
                    onChange={(e) => setNfsExport(e.target.value)}
                    required
                    placeholder="/export/games"
                  />
                </Form.Group>
              </>
            ) : (
              <Form.Group className="mb-3">
                <Form.Label>{t("admin.storageHostPath")}</Form.Label>
                <Form.Control
                  value={hostPath}
                  onChange={(e) => setHostPath(e.target.value)}
                  placeholder="/data/games"
                />
              </Form.Group>
            )}
            <Form.Group className="mb-3">
              <Form.Label>{t("admin.storageDiskBudget")}</Form.Label>
              <Form.Control
                type="number"
                min={0}
                value={diskMb}
                onChange={(e) => setDiskMb(Number(e.target.value) || 0)}
              />
              <Form.Text className="text-secondary">{t("admin.storageDiskBudgetHelp")}</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t("admin.storageFirstNode")}</Form.Label>
              <Form.Select value={createNodeId} onChange={(e) => setCreateNodeId(e.target.value)}>
                <option value="">{t("admin.storageFirstNodeLater")}</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            {createNodeId && (
              <Form.Group className="mb-0">
                <Form.Label>{t("admin.storageMountPointOptional")}</Form.Label>
                <Form.Control
                  value={mountPoint}
                  onChange={(e) => setMountPoint(e.target.value)}
                  placeholder="/var/lib/guartrix/mounts/…"
                />
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowCreate(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("common.create")}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {error && (
        <Alert variant="danger" className="mt-3" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </AdminPageShell>
  );
}
