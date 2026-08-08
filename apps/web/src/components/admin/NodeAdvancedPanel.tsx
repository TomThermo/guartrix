import { useEffect, useState, type FormEvent } from "react";
import type { DaemonNode, UpdateNodeRequest } from "@msm/shared";
import { Button, ButtonGroup, Form, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { copyText } from "../../utils";

function LimitToggle({
  limited,
  onChange,
  unlimitedLabel,
  limitedLabel,
}: {
  limited: boolean;
  onChange: (limited: boolean) => void;
  unlimitedLabel: string;
  limitedLabel: string;
}) {
  return (
    <ButtonGroup className="node-limit-toggle">
      <Button
        type="button"
        size="sm"
        variant={!limited ? "primary" : "outline-secondary"}
        active={!limited}
        onClick={() => onChange(false)}
      >
        {unlimitedLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={limited ? "primary" : "outline-secondary"}
        active={limited}
        onClick={() => onChange(true)}
      >
        {limitedLabel}
      </Button>
    </ButtonGroup>
  );
}

export function NodeAdvancedPanel({
  node,
  busy,
  onBusy,
  onError,
  onNotice,
  onChanged,
}: {
  node: DaemonNode;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [tagsText, setTagsText] = useState(node.tags.join(", "));
  const [uploadLimitMb, setUploadLimitMb] = useState(String(node.uploadLimitMb));
  const [baseDir, setBaseDir] = useState(node.daemonBaseDirectory);
  const [sftpPort, setSftpPort] = useState(String(node.sftpPort));
  const [sftpAlias, setSftpAlias] = useState(node.sftpAlias ?? "");
  const [deployable, setDeployable] = useState(node.deployable);
  const [maintenanceMode, setMaintenanceMode] = useState(node.maintenanceMode);
  const [memoryLimited, setMemoryLimited] = useState(node.memoryMb > 0);
  const [memoryMb, setMemoryMb] = useState(String(node.memoryMb > 0 ? node.memoryMb : 0));
  const [memoryOver, setMemoryOver] = useState(String(node.memoryOverallocate));
  const [diskLimited, setDiskLimited] = useState(node.diskMb > 0);
  const [diskMb, setDiskMb] = useState(String(node.diskMb > 0 ? node.diskMb : 0));
  const [diskOver, setDiskOver] = useState(String(node.diskOverallocate));
  const [cpuLimited, setCpuLimited] = useState(node.cpuLimit > 0);
  const [cpuLimit, setCpuLimit] = useState(String(node.cpuLimit > 0 ? node.cpuLimit : 0));
  const [cpuOver, setCpuOver] = useState(String(node.cpuOverallocate));
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setTagsText(node.tags.join(", "));
    setUploadLimitMb(String(node.uploadLimitMb));
    setBaseDir(node.daemonBaseDirectory);
    setSftpPort(String(node.sftpPort));
    setSftpAlias(node.sftpAlias ?? "");
    setDeployable(node.deployable);
    setMaintenanceMode(node.maintenanceMode);
    setMemoryLimited(node.memoryMb > 0);
    setMemoryMb(String(node.memoryMb > 0 ? node.memoryMb : 0));
    setMemoryOver(String(node.memoryOverallocate));
    setDiskLimited(node.diskMb > 0);
    setDiskMb(String(node.diskMb > 0 ? node.diskMb : 0));
    setDiskOver(String(node.diskOverallocate));
    setCpuLimited(node.cpuLimit > 0);
    setCpuLimit(String(node.cpuLimit > 0 ? node.cpuLimit : 0));
    setCpuOver(String(node.cpuOverallocate));
  }, [node]);

  async function copyField(key: string, value: string) {
    try {
      await copyText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const upload = Number(uploadLimitMb);
    const port = Number(sftpPort);
    if (!Number.isInteger(upload) || upload < 1) {
      onError(t("admin.nodeUploadInvalid"));
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      onError(t("admin.nodeSftpPortInvalid"));
      return;
    }
    const dir = baseDir.trim();
    if (!dir.startsWith("/")) {
      onError(t("admin.nodeBaseDirInvalid"));
      return;
    }

    const parseOver = (raw: string) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 1000) return null;
      return n;
    };
    const memOver = parseOver(memoryOver);
    const dOver = parseOver(diskOver);
    const cOver = parseOver(cpuOver);
    if (memOver == null || dOver == null || cOver == null) {
      onError(t("admin.nodeOverallocateInvalid"));
      return;
    }

    const body: UpdateNodeRequest = {
      tags: tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      uploadLimitMb: upload,
      daemonBaseDirectory: dir.replace(/\/+$/, "") || "/var/lib/guartrix",
      sftpPort: port,
      sftpAlias: sftpAlias.trim() || null,
      deployable,
      maintenanceMode,
      memoryMb: memoryLimited ? Math.max(0, Number(memoryMb) || 0) : 0,
      memoryOverallocate: memOver,
      diskMb: diskLimited ? Math.max(0, Number(diskMb) || 0) : 0,
      diskOverallocate: dOver,
      cpuLimit: cpuLimited ? Math.max(0, Number(cpuLimit) || 0) : 0,
      cpuOverallocate: cOver,
    };

    if (memoryLimited && (!Number.isInteger(body.memoryMb) || body.memoryMb! < 1)) {
      onError(t("admin.nodeMemoryLimitInvalid"));
      return;
    }
    if (diskLimited && (!Number.isInteger(body.diskMb) || body.diskMb! < 1)) {
      onError(t("admin.nodeDiskLimitInvalid"));
      return;
    }
    if (cpuLimited && (!Number.isInteger(body.cpuLimit) || body.cpuLimit! < 1)) {
      onError(t("admin.nodeCpuLimitInvalid"));
      return;
    }

    onBusy(node.id);
    onError(null);
    try {
      await api.updateNode(node.id, body);
      onNotice(t("admin.nodeAdvancedSaved"));
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(null);
    }
  }

  return (
    <Form className="node-advanced" onSubmit={(e) => void onSave(e)}>
      <section className="admin-inset-card node-basic__toolbar">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h2 className="admin-section-title mb-0">
            <i className="fa-solid fa-screwdriver-wrench" aria-hidden />
            {t("admin.nodeTabAdvanced")}
          </h2>
          <Button type="submit" size="sm" variant="primary" disabled={busy}>
            {busy ? (
              <Spinner size="sm" animation="border" />
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk me-1" aria-hidden />
                {t("common.save")}
              </>
            )}
          </Button>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-fingerprint" aria-hidden />
          {t("admin.nodeIdentity")}
        </h2>
        <div className="node-advanced-id-grid">
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeId")}</div>
            <div className="node-meta-tile__value font-monospace small d-flex align-items-center gap-2 flex-wrap">
              <span>{node.id}</span>
              <Button
                type="button"
                size="sm"
                variant="outline-secondary"
                onClick={() => void copyField("id", node.id)}
              >
                {copied === "id" ? "✓" : t("common.copy")}
              </Button>
            </div>
          </div>
          <div className="node-meta-tile">
            <div className="node-meta-tile__label">{t("admin.nodeUuid")}</div>
            <div className="node-meta-tile__value font-monospace small d-flex align-items-center gap-2 flex-wrap">
              <span className="text-break">{node.uuid}</span>
              <Button
                type="button"
                size="sm"
                variant="outline-secondary"
                onClick={() => void copyField("uuid", node.uuid)}
              >
                {copied === "uuid" ? "✓" : t("common.copy")}
              </Button>
            </div>
          </div>
          <Form.Group className="node-basic-field" style={{ gridColumn: "1 / -1" }}>
            <Form.Label>{t("admin.nodeTags")}</Form.Label>
            <Form.Control
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder={t("admin.nodeTagsPlaceholder")}
            />
            <Form.Text muted>{t("admin.nodeTagsHint")}</Form.Text>
          </Form.Group>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-hard-drive" aria-hidden />
          {t("admin.nodeDaemonStorage")}
        </h2>
        <div className="node-basic-grid">
          <Form.Group className="node-basic-field node-basic-field--domain">
            <Form.Label>
              {t("admin.nodeUploadLimit")} <span className="text-danger">*</span>
            </Form.Label>
            <div className="input-group">
              <Form.Control
                type="number"
                min={1}
                max={20480}
                value={uploadLimitMb}
                onChange={(e) => setUploadLimitMb(e.target.value)}
                required
              />
              <span className="input-group-text">MiB</span>
            </div>
            <Form.Text muted>{t("admin.nodeUploadLimitHint")}</Form.Text>
          </Form.Group>
          <Form.Group className="node-basic-field node-basic-field--domain">
            <Form.Label>
              {t("admin.nodeBaseDirectory")} <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              className="font-monospace"
              value={baseDir}
              onChange={(e) => setBaseDir(e.target.value)}
              required
            />
            <Form.Text muted>{t("admin.nodeBaseDirectoryHint")}</Form.Text>
          </Form.Group>
          <Form.Group className="node-basic-field">
            <Form.Label>
              {t("admin.nodeSftpPort")} <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={65535}
              value={sftpPort}
              onChange={(e) => setSftpPort(e.target.value)}
              required
            />
          </Form.Group>
          <Form.Group className="node-basic-field node-basic-field--location">
            <Form.Label>{t("admin.nodeSftpAlias")}</Form.Label>
            <Form.Control
              className="font-monospace"
              value={sftpAlias}
              onChange={(e) => setSftpAlias(e.target.value)}
              placeholder={node.fqdn}
            />
            <Form.Text muted>{t("admin.nodeSftpAliasHint")}</Form.Text>
          </Form.Group>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-toggle-on" aria-hidden />
          {t("admin.nodeFlags")}
        </h2>
        <div className="node-advanced-flags">
          <div className="node-ssl-card node-advanced-flag">
            <span className="node-ssl-card__title">{t("admin.nodeDeployable")}</span>
            <span className="node-ssl-card__hint">{t("admin.nodeDeployableHint")}</span>
            <LimitToggle
              limited={!deployable}
              onChange={(off) => setDeployable(!off)}
              unlimitedLabel={t("common.yes")}
              limitedLabel={t("common.no")}
            />
          </div>
          <div className="node-ssl-card node-advanced-flag">
            <span className="node-ssl-card__title">{t("admin.nodeMaintenance")}</span>
            <span className="node-ssl-card__hint">{t("admin.nodeMaintenanceHint")}</span>
            <LimitToggle
              limited={maintenanceMode}
              onChange={setMaintenanceMode}
              unlimitedLabel={t("common.disabled")}
              limitedLabel={t("common.enabled")}
            />
          </div>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-gauge-high" aria-hidden />
          {t("admin.nodeResourceLimits")}
        </h2>
        <div className="node-advanced-resources">
          {(
            [
              {
                key: "memory",
                title: t("admin.nodeMemoryLive"),
                limited: memoryLimited,
                setLimited: setMemoryLimited,
                value: memoryMb,
                setValue: setMemoryMb,
                over: memoryOver,
                setOver: setMemoryOver,
                unit: "MiB",
              },
              {
                key: "disk",
                title: t("admin.nodeDiskLimit"),
                limited: diskLimited,
                setLimited: setDiskLimited,
                value: diskMb,
                setValue: setDiskMb,
                over: diskOver,
                setOver: setDiskOver,
                unit: "MiB",
              },
              {
                key: "cpu",
                title: t("admin.nodeCpuLimit"),
                limited: cpuLimited,
                setLimited: setCpuLimited,
                value: cpuLimit,
                setValue: setCpuLimit,
                over: cpuOver,
                setOver: setCpuOver,
                unit: "%",
              },
            ] as const
          ).map((row) => (
            <div key={row.key} className="node-advanced-resource">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <strong>{row.title}</strong>
                <LimitToggle
                  limited={row.limited}
                  onChange={row.setLimited}
                  unlimitedLabel={t("admin.nodeUnlimited")}
                  limitedLabel={t("admin.nodeLimited")}
                />
              </div>
              {row.limited ? (
                <div className="row g-2">
                  <div className="col-sm-6">
                    <Form.Label className="small mb-1">
                      {t("admin.nodeLimit")} <span className="text-danger">*</span>
                    </Form.Label>
                    <div className="input-group input-group-sm">
                      <Form.Control
                        type="number"
                        min={1}
                        value={row.value}
                        onChange={(e) => row.setValue(e.target.value)}
                        required
                      />
                      <span className="input-group-text">{row.unit}</span>
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <Form.Label className="small mb-1">{t("admin.nodeOverallocate")}</Form.Label>
                    <div className="input-group input-group-sm">
                      <Form.Control
                        type="number"
                        min={0}
                        max={1000}
                        value={row.over}
                        onChange={(e) => row.setOver(e.target.value)}
                      />
                      <span className="input-group-text">%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="small text-secondary mb-0">{t("admin.nodeUnlimitedHint")}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </Form>
  );
}
