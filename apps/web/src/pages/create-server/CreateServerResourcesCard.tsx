import { BACKUP_KEEP_COUNT_PRESETS } from "@guartrix/shared";
import { useEffect, useState } from "react";
import { Button, Collapse, Form } from "react-bootstrap";
import { MemorySelect } from "../../components/MemorySelect";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import type { DaemonNode } from "@guartrix/shared";

export function CreateServerResourcesCard({
  port,
  onPortChange,
  portError,
  portChecking,
  portManuallyEdited,
  nodeId,
  memoryMb,
  onMemoryMbChange,
  diskMb,
  onDiskMbChange,
  keepCount,
  onKeepCountChange,
  cpuLimit,
  onCpuLimitChange,
  remainingRamMb,
  selectedNode,
  selectedFreeMb,
  isAdmin,
  storageId,
  onStorageIdChange,
}: {
  port: number;
  onPortChange: (port: number) => void;
  portError: string | null;
  portChecking: boolean;
  portManuallyEdited: boolean;
  nodeId: string;
  memoryMb: number;
  onMemoryMbChange: (mb: number) => void;
  diskMb: number;
  onDiskMbChange: (mb: number) => void;
  keepCount: number;
  onKeepCountChange: (n: number) => void;
  cpuLimit: number;
  onCpuLimitChange: (n: number) => void;
  remainingRamMb: number | null;
  selectedNode: DaemonNode | null;
  selectedFreeMb: number;
  isAdmin?: boolean;
  storageId?: string;
  onStorageIdChange?: (id: string) => void;
}) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [storages, setStorages] = useState<Array<{ id: string; name: string; type: string }>>([]);

  useEffect(() => {
    if (!isAdmin || !nodeId || !onStorageIdChange) {
      setStorages([]);
      return;
    }
    let cancelled = false;
    void api
      .adminListNodeStorages(nodeId)
      .then((res) => {
        if (cancelled) return;
        const list = (res.storages as Array<{
          id: string;
          name: string;
          type: string;
          enabled: boolean;
          links: Array<{
            hostPath: string | null;
            mountPoint: string;
            status: { exists: boolean; mounted: boolean } | null;
          }>;
        }>)
          .filter((s) => {
            if (!s.enabled) return false;
            const link = s.links[0];
            if (!link?.status?.exists) return false;
            if (s.type === "NFS") return Boolean(link.status.mounted);
            if (link.hostPath && link.hostPath !== link.mountPoint) {
              return Boolean(link.status.mounted);
            }
            return true;
          })
          .map((s) => ({ id: s.id, name: s.name, type: s.type }));
        setStorages(list);
        if (storageId && !list.some((s) => s.id === storageId)) {
          onStorageIdChange("");
        }
      })
      .catch(() => {
        if (!cancelled) setStorages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, nodeId, onStorageIdChange, storageId]);

  return (
    <AdminPanelCard title={t("createServer.sectionResources")} icon="fa-gauge-high">
      <Form.Group className="mb-3" controlId="port">
        <Form.Label>{t("createServer.port")}</Form.Label>
        <Form.Control
          type="number"
          min={1024}
          max={65535}
          value={port}
          onChange={(e) => onPortChange(Number(e.target.value))}
          isInvalid={!!portError}
          required
        />
        {portChecking && (
          <Form.Text className="text-secondary">{t("createServer.portChecking")}</Form.Text>
        )}
        {portError && <Form.Control.Feedback type="invalid">{portError}</Form.Control.Feedback>}
        {!portError && !portManuallyEdited && nodeId && (
          <Form.Text className="text-secondary">{t("createServer.portSuggested")}</Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3" controlId="memory">
        <Form.Label>{t("createServer.memory")}</Form.Label>
        <MemorySelect
          valueMb={memoryMb}
          onChangeMb={onMemoryMbChange}
          required
          maxMb={
            remainingRamMb != null && selectedNode && selectedNode.memoryMb > 0
              ? Math.min(remainingRamMb, selectedFreeMb)
              : remainingRamMb != null
                ? remainingRamMb
                : selectedNode && selectedNode.memoryMb > 0
                  ? selectedFreeMb
                  : undefined
          }
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="disk">
        <Form.Label>{t("createServer.disk")}</Form.Label>
        <MemorySelect valueMb={diskMb} onChangeMb={onDiskMbChange} required />
        <Form.Text className="text-secondary">{t("createServer.diskHelp")}</Form.Text>
      </Form.Group>

      {isAdmin && onStorageIdChange ? (
        <Form.Group className="mb-3" controlId="storage">
          <Form.Label>{t("createServer.storagePool")}</Form.Label>
          <Form.Select
            value={storageId ?? ""}
            onChange={(e) => onStorageIdChange(e.target.value)}
          >
            <option value="">{t("createServer.storagePoolDefault")}</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </Form.Select>
          <Form.Text className="text-secondary">{t("createServer.storagePoolHelp")}</Form.Text>
        </Form.Group>
      ) : null}

      <Button
        type="button"
        variant="link"
        className="px-0 mb-2 text-decoration-none"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        <i
          className={`fa-solid ${advancedOpen ? "fa-chevron-down" : "fa-chevron-right"} me-1`}
          aria-hidden
        />
        {t("createServer.advanced")}
      </Button>

      <Collapse in={advancedOpen}>
        <div>
          <Form.Group className="mb-3" controlId="keepCount">
            <Form.Label>{t("createServer.backupKeepCount")}</Form.Label>
            <Form.Select
              value={keepCount}
              onChange={(e) => onKeepCountChange(Number(e.target.value))}
            >
              {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
                <option key={n} value={n}>
                  {t("backups.backupsCount", { n })}
                </option>
              ))}
            </Form.Select>
            <Form.Text className="text-secondary">{t("createServer.backupKeepCountHelp")}</Form.Text>
          </Form.Group>

          <Form.Group className="mb-0" controlId="cpu">
            <Form.Label>{t("createServer.cpuLimit")}</Form.Label>
            <Form.Select value={cpuLimit} onChange={(e) => onCpuLimitChange(Number(e.target.value))}>
              <option value={0}>{t("createServer.unlimited")}</option>
              <option value={50}>0.5 core (50%)</option>
              <option value={100}>1 core (100%)</option>
              <option value={200}>2 cores (200%)</option>
              <option value={400}>4 cores (400%)</option>
              <option value={800}>8 cores (800%)</option>
            </Form.Select>
            <Form.Text className="text-secondary">{t("createServer.cpuLimitHelp")}</Form.Text>
          </Form.Group>
        </div>
      </Collapse>
    </AdminPanelCard>
  );
}
