import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminServerRow, AuthUser } from "@guartrix/shared";
import { BACKUP_KEEP_COUNT_PRESETS, roleLabel } from "@guartrix/shared";
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { MemorySelect } from "../../components/MemorySelect";
import { useI18n } from "../../i18n/react";

type CpuOption =
  | { value: number; labelKey: "createServer.unlimited" }
  | { value: number; label: string };

const CPU_OPTIONS: CpuOption[] = [
  { value: 0, labelKey: "createServer.unlimited" },
  { value: 50, label: "0.5 core (50%)" },
  { value: 100, label: "1 core (100%)" },
  { value: 200, label: "2 cores (200%)" },
  { value: 400, label: "4 cores (400%)" },
  { value: 800, label: "8 cores (800%)" },
];

type EditDraft = {
  name: string;
  ownerId: string;
  memoryMb: number;
  diskMb: number;
  cpuLimit: number;
  suspended: boolean;
  keepCount: number;
};

function toDraft(row: AdminServerRow): EditDraft {
  return {
    name: row.name,
    ownerId: row.ownerId ?? "",
    memoryMb: row.memoryMb,
    diskMb: row.diskMb,
    cpuLimit: row.cpuLimit,
    suspended: row.suspended,
    keepCount: row.keepCount,
  };
}

export function AdminServerEditModal({
  row,
  users,
  busy,
  onClose,
  onSaved,
}: {
  row: AdminServerRow;
  users: AuthUser[];
  busy: boolean;
  onClose: () => void;
  onSaved: (server: AdminServerRow) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => toDraft(row));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(row));
    setError(null);
  }, [row]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateAdminServer(row.id, {
        name: draft.name.trim(),
        ownerId: draft.ownerId || null,
        memoryMb: draft.memoryMb,
        diskMb: draft.diskMb,
        cpuLimit: draft.cpuLimit,
        suspended: draft.suspended,
        keepCount: draft.keepCount,
      });
      onSaved(res.server);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminServers.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <Modal show onHide={disabled ? undefined : onClose} size="lg" centered backdrop="static">
      <Modal.Header closeButton={!disabled}>
        <Modal.Title>{t("adminServers.editTitle", { name: row.name })}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error ? (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="admin-server-name">
              <Form.Label>{t("adminServers.fieldName")}</Form.Label>
              <Form.Control
                value={draft.name}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="admin-server-owner">
              <Form.Label>{t("adminServers.fieldOwner")}</Form.Label>
              <Form.Select
                value={draft.ownerId}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value }))}
              >
                <option value="">{t("adminServers.noOwner")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({roleLabel(u.role)})
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="admin-server-memory">
              <Form.Label>{t("adminServers.fieldMemory")}</Form.Label>
              <MemorySelect
                valueMb={draft.memoryMb}
                disabled={disabled}
                onChangeMb={(memoryMb) => setDraft((d) => ({ ...d, memoryMb }))}
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="admin-server-disk">
              <Form.Label>{t("adminServers.fieldDisk")}</Form.Label>
              <MemorySelect
                valueMb={draft.diskMb}
                disabled={disabled}
                onChangeMb={(diskMb) => setDraft((d) => ({ ...d, diskMb }))}
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="admin-server-cpu">
              <Form.Label>{t("createServer.cpuLimit")}</Form.Label>
              <Form.Select
                value={draft.cpuLimit}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, cpuLimit: Number(e.target.value) }))}
              >
                {CPU_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {"labelKey" in opt ? t(opt.labelKey) : opt.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="admin-server-keep">
              <Form.Label>{t("adminServers.fieldBackups")}</Form.Label>
              <Form.Select
                value={draft.keepCount}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, keepCount: Number(e.target.value) }))}
              >
                {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
                  <option key={n} value={n}>
                    {t("backups.backupsCount", { n })}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6} className="d-flex align-items-end">
            <Form.Check
              type="switch"
              id="admin-server-suspended"
              disabled={disabled}
              label={t("adminServers.fieldSuspended")}
              checked={draft.suspended}
              onChange={(e) => setDraft((d) => ({ ...d, suspended: e.target.checked }))}
            />
          </Col>
        </Row>

        <hr />
        <dl className="row small text-secondary mb-0">
          <dt className="col-sm-3">{t("adminServers.metaNode")}</dt>
          <dd className="col-sm-9">{row.nodeName ?? "—"}</dd>
          <dt className="col-sm-3">{t("adminServers.metaType")}</dt>
          <dd className="col-sm-9">
            {row.type} · {row.mcVersion}
          </dd>
          <dt className="col-sm-3">{t("adminServers.metaPort")}</dt>
          <dd className="col-sm-9">{row.port}</dd>
          <dt className="col-sm-3">{t("adminServers.metaBackups")}</dt>
          <dd className="col-sm-9">
            {row.backupCount} / {row.keepCount}
            {row.scheduleMode !== "off" ? (
              <Badge bg="secondary" className="ms-2">
                {t("adminServers.scheduled")}
              </Badge>
            ) : null}
          </dd>
        </dl>
        <p className="small text-secondary mt-3 mb-0">
          {t("adminServers.deepSettingsHint")}{" "}
          <Link to={`/servers/${row.id}`}>{t("adminServers.openServer")}</Link>
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={disabled} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={disabled} onClick={() => void onSave()}>
          {saving ? (
            <>
              <Spinner size="sm" className="me-2" />
              {t("common.saving")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
