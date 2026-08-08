import { useEffect, useMemo, useRef, useState } from "react";
import type { AddonProjectDetails, AddonVersionInfo } from "@msm/shared";
import { Badge, Button, Modal, Nav, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatCount, formatWhen } from "../utils";
import { AddonDetailChangelog } from "./addon-panel/AddonDetailChangelog";
import { AddonDetailDescription } from "./addon-panel/AddonDetailDescription";
import { AddonDetailGallery } from "./addon-panel/AddonDetailGallery";
import { AddonDetailVersions } from "./addon-panel/AddonDetailVersions";

interface Props {
  serverId: string;
  projectId: string;
  installed: boolean;
  installing: boolean;
  canUpdate?: boolean;
  onClose: () => void;
  /** Opens the version picker (footer / choose version). */
  onInstall: (projectId: string, title: string, iconUrl?: string | null) => void;
  /** Install a specific build from the Versions tab. */
  onInstallVersion?: (
    projectId: string,
    versionId: string,
    title: string,
    iconUrl?: string | null,
  ) => void;
  onUninstall?: (projectId: string) => void;
  onError: (message: string | null) => void;
}

type DetailTab = "description" | "gallery" | "changelog" | "versions";

export function AddonDetailModal({
  serverId,
  projectId,
  installed,
  installing,
  canUpdate = true,
  onClose,
  onInstall,
  onInstallVersion,
  onUninstall,
  onError,
}: Props) {
  const { t } = useI18n();
  const [project, setProject] = useState<AddonProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [tab, setTab] = useState<DetailTab>("description");
  const [versions, setVersions] = useState<AddonVersionInfo[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const onErrorRef = useRef(onError);
  const onCloseRef = useRef(onClose);
  onErrorRef.current = onError;
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProject(null);
    setGalleryIndex(0);
    setTab("description");
    setVersions([]);
    setVersionsLoaded(false);
    void api
      .getAddonProject(serverId, projectId)
      .then((data) => {
        if (!cancelled) setProject(data.project);
      })
      .catch((err) => {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : t("addons.loadDetailsFailed"));
          onCloseRef.current();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only reload when the project changes — not when parent recreates callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, projectId, t]);

  useEffect(() => {
    if (tab !== "changelog" && tab !== "versions") return;
    if (versionsLoaded) return;
    let cancelled = false;
    setVersionsLoading(true);
    void api
      .listAddonVersions(serverId, projectId)
      .then((data) => {
        if (!cancelled) {
          setVersions(data.versions);
          setVersionsLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : t("addons.loadingVersions"));
        }
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Do not depend on versionsLoading — setState(true) would re-run + cancel
    // the in-flight fetch (React Strict Mode), leaving the tabs stuck loading.
  }, [tab, versionsLoaded, serverId, projectId, t]);

  const tabs = useMemo(() => {
    const items: { id: DetailTab; label: string; show: boolean }[] = [
      { id: "description", label: t("addons.tabDescription"), show: true },
      {
        id: "gallery",
        label: t("addons.tabGallery"),
        show: Boolean(project?.gallery.length),
      },
      { id: "changelog", label: t("addons.tabChangelog"), show: true },
      { id: "versions", label: t("addons.tabVersions"), show: true },
    ];
    return items.filter((i) => i.show);
  }, [project, t]);

  function installVersion(versionId: string) {
    if (!project || !canUpdate) return;
    if (onInstallVersion) {
      onInstallVersion(project.projectId, versionId, project.title, project.iconUrl);
    } else {
      onInstall(project.projectId, project.title, project.iconUrl);
    }
  }

  return (
    <Modal show onHide={onClose} size="xl" centered scrollable fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2 min-w-0">
          {project?.iconUrl ? (
            <img src={project.iconUrl} alt="" width={40} height={40} className="addon-icon" />
          ) : (
            <span className="addon-icon addon-icon-fallback d-grid place-items-center">
              <i className="fa-solid fa-puzzle-piece text-secondary" />
            </span>
          )}
          <span className="text-truncate">{project?.title ?? `${t("common.loading")}…`}</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {loading && (
          <div className="text-center py-5 text-secondary">
            <Spinner animation="border" />
          </div>
        )}

        {!loading && project && (
          <>
            <p className="text-secondary mb-2">{project.description}</p>

            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
              <Badge bg="secondary">
                <i className="fa-solid fa-download me-1" />
                {formatCount(project.downloads)}
              </Badge>
              <Badge bg="secondary">
                <i className="fa-solid fa-heart me-1" />
                {formatCount(project.follows)}
              </Badge>
              {project.license && <Badge bg="secondary">License: {project.license}</Badge>}
            </div>

            <div className="addon-environments mb-3">
              <div className="small text-secondary fw-semibold mb-2">
                {t("addons.supportedEnvironments")}
              </div>
              <Stack direction="horizontal" gap={2} className="flex-wrap">
                {(["client", "server", "both"] as const).map((env) => {
                  const client = (project.clientSide || "").toLowerCase();
                  const server = (project.serverSide || "").toLowerCase();
                  const clientOk = client === "required" || client === "optional";
                  const serverOk = server === "required" || server === "optional";
                  const active =
                    env === "client"
                      ? clientOk && !serverOk
                      : env === "server"
                        ? serverOk && !clientOk
                        : clientOk && serverOk;
                  const label =
                    env === "client"
                      ? t("addons.envClient")
                      : env === "server"
                        ? t("addons.envServer")
                        : t("addons.envBoth");
                  const icon =
                    env === "client" ? "fa-desktop" : env === "server" ? "fa-server" : "fa-globe";
                  return (
                    <span
                      key={env}
                      className={`addon-env-chip${active ? " is-active" : ""}`}
                      title={
                        env === "client"
                          ? t("addons.envSideDetail", {
                              side: t("addons.envClient"),
                              value: project.clientSide,
                            })
                          : env === "server"
                            ? t("addons.envSideDetail", {
                                side: t("addons.envServer"),
                                value: project.serverSide,
                              })
                            : t("addons.envBothDetail", {
                                client: project.clientSide,
                                server: project.serverSide,
                              })
                      }
                    >
                      <i className={`fa-solid ${icon}`} aria-hidden />
                      {label}
                      {active && <i className="fa-solid fa-check addon-env-check" aria-hidden />}
                    </span>
                  );
                })}
              </Stack>
            </div>

            {project.authors.length > 0 && (
              <div className="small text-secondary mb-2">
                {t("addons.byAuthors", { authors: project.authors.join(", ") })}
              </div>
            )}

            <div className="small text-secondary mb-3">
              {t("addons.published", { date: formatWhen(project.publishedAt) })} ·{" "}
              {t("addons.updated", { date: formatWhen(project.updatedAt) })}
            </div>

            {project.categories.length > 0 && (
              <Stack direction="horizontal" gap={1} className="flex-wrap mb-3">
                {project.categories.map((c) => (
                  <Badge key={c} bg="secondary">
                    {c}
                  </Badge>
                ))}
              </Stack>
            )}

            <Nav
              variant="pills"
              className="addon-detail-tabs flex-nowrap overflow-auto mb-3"
              activeKey={tab}
              onSelect={(k) => k && setTab(k as DetailTab)}
            >
              {tabs.map((item) => (
                <Nav.Item key={item.id}>
                  <Nav.Link eventKey={item.id}>{item.label}</Nav.Link>
                </Nav.Item>
              ))}
            </Nav>

            {tab === "description" && <AddonDetailDescription project={project} />}

            {tab === "gallery" && (
              <AddonDetailGallery
                project={project}
                galleryIndex={galleryIndex}
                onGalleryIndexChange={setGalleryIndex}
              />
            )}

            {tab === "changelog" && (
              <AddonDetailChangelog versions={versions} loading={versionsLoading} />
            )}

            {tab === "versions" && (
              <AddonDetailVersions
                versions={versions}
                loading={versionsLoading}
                installing={installing}
                canUpdate={canUpdate}
                onInstallVersion={installVersion}
              />
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
        {canUpdate &&
          (installed ? (
            <>
              <Button
                variant="primary"
                disabled={installing || !project}
                onClick={() =>
                  project && onInstall(project.projectId, project.title, project.iconUrl)
                }
              >
                {t("addons.changeVersion")}
              </Button>
              <Button
                variant="outline-danger"
                disabled={installing || !project}
                onClick={() => project && onUninstall?.(project.projectId)}
              >
                {installing ? t("addons.removing") : t("common.remove")}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={installing || !project}
              onClick={() =>
                project && onInstall(project.projectId, project.title, project.iconUrl)
              }
            >
              {installing ? t("addons.working") : t("addons.chooseVersion")}
            </Button>
          ))}
      </Modal.Footer>
    </Modal>
  );
}
