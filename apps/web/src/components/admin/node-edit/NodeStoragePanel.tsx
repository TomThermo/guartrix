import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import { api } from "../../../api";
import { useI18n } from "../../../i18n/react";

export type NodeStorageRow = {
  id: string;
  nodeId: string;
  name: string;
  type: "LOCAL" | "NFS";
  mountPoint: string;
  hostPath: string | null;
  nfsServer: string | null;
  nfsExport: string | null;
  nfsOptions: string | null;
  diskMb: number;
  enabled: boolean;
  serverCount: number;
  status: {
    path: string;
    exists: boolean;
    mounted: boolean;
    source: string | null;
    fstype: string | null;
    disk: {
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usedPercent: number;
    } | null;
    busyServerIds: string[];
  } | null;
};

function formatBytes(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(1)} GiB`;
}

function storageReady(s: NodeStorageRow): boolean {
  if (!s.status?.exists) return false;
  if (s.type === "NFS") return s.status.mounted;
  if (s.hostPath && s.hostPath !== s.mountPoint) return s.status.mounted;
  return true;
}

export function NodeStoragePanel({
  nodeId,
  busy,
  onBusy,
  onError,
  onNotice,
}: {
  nodeId: string;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const { t } = useI18n();
  const [storages, setStorages] = useState<NodeStorageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"LOCAL" | "NFS">("LOCAL");
  const [hostPath, setHostPath] = useState("");
  const [mountPoint, setMountPoint] = useState("");
  const [nfsServer, setNfsServer] = useState("");
  const [nfsExport, setNfsExport] = useState("");
  const [nfsOptions, setNfsOptions] = useState("vers=4.1,hard,timeo=600,_netdev");
  const [diskMb, setDiskMb] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminListNodeStorages(nodeId);
      setStorages(res.storages as NodeStorageRow[]);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeId, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    onBusy(nodeId);
    onError(null);
    try {
      await api.adminCreateNodeStorage(nodeId, {
        name: name.trim(),
        type,
        ...(hostPath.trim() ? { hostPath: hostPath.trim() } : {}),
        ...(mountPoint.trim() ? { mountPoint: mountPoint.trim() } : {}),
        ...(type === "NFS"
          ? {
              nfsServer: nfsServer.trim(),
              nfsExport: nfsExport.trim(),
              nfsOptions: nfsOptions.trim() || null,
            }
          : {}),
        diskMb,
      });
      setShowForm(false);
      setName("");
      setHostPath("");
      setMountPoint("");
      setNfsServer("");
      setNfsExport("");
      setDiskMb(0);
      onNotice(t("admin.nodeStorageCreated"));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(null);
    }
  }

  async function onMount(id: string) {
    onBusy(nodeId);
    onError(null);
    try {
      await api.adminMountNodeStorage(nodeId, id);
      onNotice(t("admin.nodeStorageMounted"));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(null);
    }
  }

  async function onUnmount(id: string) {
    onBusy(nodeId);
    onError(null);
    try {
      await api.adminUnmountNodeStorage(nodeId, id);
      onNotice(t("admin.nodeStorageUnmounted"));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(null);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm(t("admin.nodeStorageDeleteConfirm"))) return;
    onBusy(nodeId);
    onError(null);
    try {
      await api.adminDeleteNodeStorage(nodeId, id);
      onNotice(t("admin.nodeStorageDeleted"));
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(null);
    }
  }

  return (
    <div className="node-storage-panel">
      <p className="text-secondary small mb-3">{t("admin.nodeStorageHelp")}</p>

      {loading ? (
        <div className="py-4 text-center text-secondary">
          <Spinner animation="border" size="sm" className="me-2" />
          {t("common.loading")}
        </div>
      ) : storages.length === 0 && !showForm ? (
        <Alert variant="secondary" className="py-2">
          {t("admin.nodeStorageEmpty")}
        </Alert>
      ) : (
        <Table responsive hover size="sm" className="align-middle">
          <thead>
            <tr>
              <th>{t("admin.nodeStorageName")}</th>
              <th>{t("admin.nodeStorageType")}</th>
              <th>{t("admin.nodeStorageMountPoint")}</th>
              <th>{t("admin.nodeStorageStatus")}</th>
              <th>{t("admin.nodeStorageFree")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {storages.map((s) => {
              const ready = storageReady(s);
              return (
                <tr key={s.id}>
                  <td>
                    <div className="fw-semibold">{s.name}</div>
                    <div className="small text-secondary">
                      {s.serverCount} {t("admin.nodeStorageServers")}
                      {s.diskMb > 0 ? ` · ${s.diskMb} MiB` : ""}
                    </div>
                  </td>
                  <td>
                    <Badge bg="secondary">{s.type}</Badge>
                  </td>
                  <td>
                    <code className="small">{s.mountPoint}</code>
                    {s.type === "NFS" && s.nfsServer && (
                      <div className="small text-secondary">
                        {s.nfsServer}:{s.nfsExport}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge bg={ready ? "success" : s.status?.mounted ? "warning" : "secondary"}>
                      {ready
                        ? t("admin.nodeStorageReady")
                        : s.status?.mounted
                          ? t("admin.nodeStorageMountedLabel")
                          : t("admin.nodeStorageUnmountedLabel")}
                    </Badge>
                  </td>
                  <td className="small">{formatBytes(s.status?.disk?.freeBytes)}</td>
                  <td className="text-end text-nowrap">
                    <Button
                      size="sm"
                      variant="outline-success"
                      className="me-1"
                      disabled={busy || ready}
                      onClick={() => void onMount(s.id)}
                    >
                      {t("admin.nodeStorageMount")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-warning"
                      className="me-1"
                      disabled={busy || (!s.status?.mounted && s.type === "LOCAL")}
                      onClick={() => void onUnmount(s.id)}
                    >
                      {t("admin.nodeStorageUnmount")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={busy || s.serverCount > 0}
                      onClick={() => void onDelete(s.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {!showForm ? (
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => setShowForm(true)}
          className="mt-2"
        >
          <i className="fa-solid fa-plus me-1" aria-hidden />
          {t("admin.nodeStorageAdd")}
        </Button>
      ) : (
        <Form onSubmit={(e) => void onCreate(e)} className="border rounded p-3 mt-3">
          <div className="fw-semibold mb-2">{t("admin.nodeStorageAdd")}</div>
          <Form.Group className="mb-2">
            <Form.Label>{t("admin.nodeStorageName")}</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={64}
              placeholder="ssd-1"
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t("admin.nodeStorageType")}</Form.Label>
            <Form.Select
              value={type}
              onChange={(e) => setType(e.target.value === "NFS" ? "NFS" : "LOCAL")}
            >
              <option value="LOCAL">{t("admin.nodeStorageTypeLocal")}</option>
              <option value="NFS">{t("admin.nodeStorageTypeNfs")}</option>
            </Form.Select>
          </Form.Group>
          {type === "LOCAL" ? (
            <>
              <Form.Group className="mb-2">
                <Form.Label>{t("admin.nodeStorageHostPath")}</Form.Label>
                <Form.Control
                  value={hostPath}
                  onChange={(e) => setHostPath(e.target.value)}
                  placeholder="/mnt/ssd"
                />
                <Form.Text className="text-secondary">{t("admin.nodeStorageHostPathHelp")}</Form.Text>
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>{t("admin.nodeStorageMountPoint")}</Form.Label>
                <Form.Control
                  value={mountPoint}
                  onChange={(e) => setMountPoint(e.target.value)}
                  placeholder={t("admin.nodeStorageMountPointOptional")}
                />
              </Form.Group>
            </>
          ) : (
            <>
              <Form.Group className="mb-2">
                <Form.Label>{t("admin.nodeStorageNfsServer")}</Form.Label>
                <Form.Control
                  value={nfsServer}
                  onChange={(e) => setNfsServer(e.target.value)}
                  required
                  placeholder="nfs.example.com"
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>{t("admin.nodeStorageNfsExport")}</Form.Label>
                <Form.Control
                  value={nfsExport}
                  onChange={(e) => setNfsExport(e.target.value)}
                  required
                  placeholder="/export/games"
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>{t("admin.nodeStorageNfsOptions")}</Form.Label>
                <Form.Control
                  value={nfsOptions}
                  onChange={(e) => setNfsOptions(e.target.value)}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>{t("admin.nodeStorageMountPoint")}</Form.Label>
                <Form.Control
                  value={mountPoint}
                  onChange={(e) => setMountPoint(e.target.value)}
                  placeholder={t("admin.nodeStorageMountPointAuto")}
                />
              </Form.Group>
            </>
          )}
          <Form.Group className="mb-3">
            <Form.Label>{t("admin.nodeStorageDiskBudget")}</Form.Label>
            <Form.Control
              type="number"
              min={0}
              value={diskMb}
              onChange={(e) => setDiskMb(Number(e.target.value) || 0)}
            />
            <Form.Text className="text-secondary">{t("admin.nodeStorageDiskBudgetHelp")}</Form.Text>
          </Form.Group>
          <div className="d-flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim()}>
              {t("common.save")}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              size="sm"
              disabled={busy}
              onClick={() => setShowForm(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}
