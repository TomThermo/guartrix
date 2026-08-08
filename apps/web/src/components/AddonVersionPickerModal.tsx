import { useEffect, useMemo, useState } from "react";
import type { AddonVersionInfo } from "@msm/shared";
import { Badge, Button, Form, ListGroup, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatBytes } from "../utils";

interface Props {
  serverId: string;
  projectId: string;
  title: string;
  iconUrl?: string | null;
  /** Server's configured Minecraft version (default filter). */
  mcVersion: string;
  /** When changing an installed mod, highlight / preselect this version. */
  currentVersionId?: string | null;
  mode?: "install" | "change";
  installing: boolean;
  onClose: () => void;
  onInstall: (projectId: string, versionId: string) => void;
  onError: (message: string | null) => void;
}

function channelBadge(channel: string) {
  const c = channel.toLowerCase();
  if (c === "release") return "success";
  if (c === "beta") return "warning";
  if (c === "alpha") return "danger";
  return "secondary";
}

export function AddonVersionPickerModal({
  serverId,
  projectId,
  title,
  iconUrl,
  mcVersion,
  currentVersionId = null,
  mode = "install",
  installing,
  onClose,
  onInstall,
  onError,
}: Props) {
  const { t } = useI18n();
  const [allVersions, setAllVersions] = useState<AddonVersionInfo[]>([]);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [filterMc, setFilterMc] = useState(mcVersion);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAllVersions([]);
    setGameVersions([]);
    setSelectedId(null);
    setFilterMc(mcVersion);
    onError(null);
    void api
      .listAddonVersions(serverId, projectId)
      .then((data) => {
        if (cancelled) return;
        setAllVersions(data.versions);
        const gvs = [...data.gameVersions];
        // Put server MC version first when present.
        if (data.serverMcVersion && gvs.includes(data.serverMcVersion)) {
          gvs.splice(gvs.indexOf(data.serverMcVersion), 1);
          gvs.unshift(data.serverMcVersion);
        }
        setGameVersions(gvs);
        const initialFilter =
          data.serverMcVersion && gvs.includes(data.serverMcVersion)
            ? data.serverMcVersion
            : (gvs[0] ?? data.serverMcVersion);
        setFilterMc(initialFilter);
      })
      .catch((err) => {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : t("addons.loadingVersions"));
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, projectId, mcVersion, onClose, onError, t]);

  const filtered = useMemo(() => {
    if (!filterMc) return allVersions;
    return allVersions.filter((v) => v.gameVersions.includes(filterMc));
  }, [allVersions, filterMc]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (currentVersionId && filtered.some((v) => v.versionId === currentVersionId)) {
      setSelectedId(currentVersionId);
      return;
    }
    setSelectedId(filtered[0]!.versionId);
  }, [filtered, currentVersionId]);

  const actionLabel = mode === "change" ? t("addons.switchSelected") : t("addons.installSelected");

  return (
    <Modal show onHide={installing ? undefined : onClose} centered scrollable>
      <Modal.Header closeButton={!installing}>
        <Modal.Title className="d-flex align-items-center gap-2 min-w-0">
          {iconUrl ? (
            <img src={iconUrl} alt="" width={32} height={32} className="addon-icon" />
          ) : (
            <span className="addon-icon addon-icon-fallback d-grid place-items-center">
              <i className="fa-solid fa-puzzle-piece text-secondary" />
            </span>
          )}
          <span className="text-truncate">
            {mode === "change" ? t("addons.changeVersionTitle") : t("addons.installTitle")} —{" "}
            {title}
          </span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3" controlId="addon-mc-filter">
          <Form.Label className="small text-secondary mb-1">
            {t("addons.minecraftVersion")}
          </Form.Label>
          <Form.Select
            size="sm"
            value={filterMc}
            disabled={loading || installing || gameVersions.length === 0}
            onChange={(e) => setFilterMc(e.target.value)}
          >
            {gameVersions.map((gv) => (
              <option key={gv} value={gv}>
                {gv}
                {gv === mcVersion ? t("addons.serverSuffix") : ""}
              </option>
            ))}
          </Form.Select>
          <Form.Text muted>
            {t("addons.latestHint")} <Badge bg="primary">{t("addons.latest")}</Badge>.
          </Form.Text>
        </Form.Group>

        {loading && (
          <div className="text-center py-4 text-secondary">
            <Spinner animation="border" size="sm" className="me-2" />
            {t("addons.loadingVersions")}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-secondary small">
            {t("addons.noBuildsFor", { version: filterMc })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ListGroup variant="flush" className="addon-version-list border rounded">
            {filtered.map((v, index) => {
              const selected = selectedId === v.versionId;
              const isCurrent = Boolean(currentVersionId && v.versionId === currentVersionId);
              return (
                <ListGroup.Item
                  key={v.versionId}
                  action
                  active={selected}
                  disabled={installing}
                  className="addon-version-item"
                  onClick={() => setSelectedId(v.versionId)}
                >
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="min-w-0">
                      <div className="fw-semibold d-flex flex-wrap align-items-center gap-1">
                        <span>{v.versionNumber}</span>
                        {index === 0 && (
                          <Badge
                            bg={selected ? "light" : "primary"}
                            text={selected ? "dark" : undefined}
                          >
                            {t("addons.latest")}
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge
                            bg={selected ? "light" : "secondary"}
                            text={selected ? "dark" : undefined}
                          >
                            {t("addons.current")}
                          </Badge>
                        )}
                        <Badge bg={channelBadge(v.releaseChannel)}>{v.releaseChannel}</Badge>
                      </div>
                      <div className={`small ${selected ? "text-white-50" : "text-secondary"}`}>
                        {v.fileName}
                        {v.fileSize > 0 ? ` · ${formatBytes(v.fileSize)}` : ""}
                      </div>
                    </div>
                    {selected && <i className="fa-solid fa-check mt-1" aria-hidden />}
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" disabled={installing} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={
            installing || !selectedId || (mode === "change" && selectedId === currentVersionId)
          }
          onClick={() => selectedId && onInstall(projectId, selectedId)}
        >
          {installing ? (
            <>
              <Spinner size="sm" className="me-2" />
              {mode === "change" ? t("addons.switching") : t("addons.installing")}
            </>
          ) : (
            <>
              <i className="fa-solid fa-download me-1" />
              {actionLabel}
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
