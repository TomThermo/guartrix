import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AddonProjectDetails, AddonVersionInfo } from "@msm/shared";
import {
  Badge,
  Button,
  Col,
  ListGroup,
  Modal,
  Nav,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatBytes, formatCount, formatWhen } from "../utils";

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

/** Lightweight markdown-ish renderer (no extra dependency). */
function safeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "127.0.0.1" ||
      host === "::1"
    ) {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);

  function inline(raw: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const re =
      /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = re.exec(raw))) {
      if (match.index > last) parts.push(raw.slice(last, match.index));
      if (match[1]?.startsWith("![")) {
        const src = safeHttpUrl(match[3]);
        if (src) {
          parts.push(
            <img key={key++} src={src} alt={match[2]} className="addon-md-img" />,
          );
        } else {
          parts.push(match[2] || "");
        }
      } else if (match[1]?.startsWith("[")) {
        const href = safeHttpUrl(match[5]);
        if (href) {
          parts.push(
            <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
              {match[4]}
            </a>,
          );
        } else {
          parts.push(match[4] || "");
        }
      } else if (match[6]) {
        parts.push(<code key={key++}>{match[6]}</code>);
      } else if (match[7]) {
        parts.push(<strong key={key++}>{match[7]}</strong>);
      } else if (match[8]) {
        parts.push(<em key={key++}>{match[8]}</em>);
      }
      last = match.index + match[0].length;
    }
    if (last < raw.length) parts.push(raw.slice(last));
    return parts;
  }

  return (
    <div className="addon-markdown">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (/^###\s+/.test(trimmed)) {
          return <h4 key={i}>{inline(trimmed.replace(/^###\s+/, ""))}</h4>;
        }
        if (/^##\s+/.test(trimmed)) {
          return <h3 key={i}>{inline(trimmed.replace(/^##\s+/, ""))}</h3>;
        }
        if (/^#\s+/.test(trimmed)) {
          return <h2 key={i}>{inline(trimmed.replace(/^#\s+/, ""))}</h2>;
        }
        if (/^[-*]\s+/m.test(trimmed)) {
          const items = trimmed.split("\n").filter((l) => /^[-*]\s+/.test(l.trim()));
          if (items.length) {
            return (
              <ul key={i}>
                {items.map((item, j) => (
                  <li key={j}>{inline(item.replace(/^[-*]\s+/, ""))}</li>
                ))}
              </ul>
            );
          }
        }
        if (trimmed.startsWith("```")) {
          const code = trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          return (
            <pre key={i}>
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <p key={i}>
            {trimmed.split("\n").map((line, j, arr) => (
              <span key={j}>
                {inline(line)}
                {j < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function channelBadge(channel: string) {
  const c = channel.toLowerCase();
  if (c === "release") return "success";
  if (c === "beta") return "warning";
  if (c === "alpha") return "danger";
  return "secondary";
}

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
          onErrorRef.current(
            err instanceof Error ? err.message : t("addons.loadDetailsFailed"),
          );
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
  }, [serverId, projectId]);

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
          onErrorRef.current(
            err instanceof Error ? err.message : t("addons.loadingVersions"),
          );
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
      onInstallVersion(
        project.projectId,
        versionId,
        project.title,
        project.iconUrl,
      );
    } else {
      onInstall(project.projectId, project.title, project.iconUrl);
    }
  }

  return (
    <Modal show onHide={onClose} size="xl" centered scrollable fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2 min-w-0">
          {project?.iconUrl ? (
            <img
              src={project.iconUrl}
              alt=""
              width={40}
              height={40}
              className="addon-icon"
            />
          ) : (
            <span className="addon-icon addon-icon-fallback d-grid place-items-center">
              <i className="fa-solid fa-puzzle-piece text-secondary" />
            </span>
          )}
          <span className="text-truncate">
            {project?.title ?? `${t("common.loading")}…`}
          </span>
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
              {project.license && (
                <Badge bg="secondary">License: {project.license}</Badge>
              )}
            </div>

            <div className="addon-environments mb-3">
              <div className="small text-secondary fw-semibold mb-2">
                {t("addons.supportedEnvironments")}
              </div>
              <Stack direction="horizontal" gap={2} className="flex-wrap">
                {(["client", "server", "both"] as const).map((env) => {
                  const client = (project.clientSide || "").toLowerCase();
                  const server = (project.serverSide || "").toLowerCase();
                  const clientOk =
                    client === "required" || client === "optional";
                  const serverOk =
                    server === "required" || server === "optional";
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
                    env === "client"
                      ? "fa-desktop"
                      : env === "server"
                        ? "fa-server"
                        : "fa-globe";
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
                      {active && (
                        <i className="fa-solid fa-check addon-env-check" aria-hidden />
                      )}
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

            {tab === "description" && (
              <>
                <h3 className="h6">{t("addons.about")}</h3>
                <SimpleMarkdown text={project.body} />
                <Stack direction="horizontal" gap={2} className="flex-wrap mt-3">
                  <a
                    className="btn btn-sm btn-outline-secondary"
                    href={project.modrinthUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square me-1" />
                    Modrinth
                  </a>
                  {project.sourceUrl && (
                    <a
                      className="btn btn-sm btn-outline-secondary"
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("addons.source")}
                    </a>
                  )}
                  {project.issuesUrl && (
                    <a
                      className="btn btn-sm btn-outline-secondary"
                      href={project.issuesUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("addons.issues")}
                    </a>
                  )}
                  {project.wikiUrl && (
                    <a
                      className="btn btn-sm btn-outline-secondary"
                      href={project.wikiUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("addons.wiki")}
                    </a>
                  )}
                  {project.discordUrl && (
                    <a
                      className="btn btn-sm btn-outline-secondary"
                      href={project.discordUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Discord
                    </a>
                  )}
                </Stack>
              </>
            )}

            {tab === "gallery" && (
              <div className="addon-gallery">
                {project.gallery.length === 0 ? (
                  <div className="text-secondary small p-3">{t("addons.noGallery")}</div>
                ) : (
                  <>
                    <div className="addon-gallery-slide">
                      <img
                        src={project.gallery[galleryIndex]?.url}
                        alt={
                          project.gallery[galleryIndex]?.title || project.title
                        }
                      />
                    </div>
                    {(project.gallery[galleryIndex]?.title ||
                      project.gallery[galleryIndex]?.description) && (
                      <div className="addon-gallery-caption px-3 py-2">
                        {project.gallery[galleryIndex]?.title && (
                          <div className="fw-semibold small">
                            {project.gallery[galleryIndex]?.title}
                          </div>
                        )}
                        {project.gallery[galleryIndex]?.description && (
                          <div className="small text-secondary">
                            {project.gallery[galleryIndex]?.description}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="addon-gallery-thumbs p-2">
                      <Row className="g-2">
                        {project.gallery.map((img, i) => (
                          <Col key={img.url} xs={4} sm={3} md={2}>
                            <button
                              type="button"
                              className={`addon-gallery-thumb${
                                i === galleryIndex ? " is-active" : ""
                              }`}
                              onClick={() => setGalleryIndex(i)}
                              aria-label={img.title || `Image ${i + 1}`}
                            >
                              <img src={img.url} alt="" />
                            </button>
                          </Col>
                        ))}
                      </Row>
                      <div className="small text-secondary text-center mt-2">
                        {galleryIndex + 1} / {project.gallery.length}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "changelog" && (
              <>
                {versionsLoading && (
                  <div className="text-center py-4 text-secondary">
                    <Spinner size="sm" className="me-2" />
                    {t("addons.loadingVersions")}
                  </div>
                )}
                {!versionsLoading && versions.length === 0 && (
                  <div className="text-secondary small">{t("addons.noChangelog")}</div>
                )}
                {!versionsLoading &&
                  versions.map((v) => (
                    <div key={v.versionId} className="addon-changelog-entry mb-4">
                      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <span className="fw-semibold">{v.versionNumber}</span>
                        <Badge bg={channelBadge(v.releaseChannel)}>
                          {v.releaseChannel}
                        </Badge>
                        {v.datePublished && (
                          <span className="small text-secondary">
                            {formatWhen(v.datePublished)}
                          </span>
                        )}
                      </div>
                      {v.changelog?.trim() ? (
                        <SimpleMarkdown text={v.changelog} />
                      ) : (
                        <div className="small text-secondary">
                          {t("addons.noChangelogEntry")}
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}

            {tab === "versions" && (
              <>
                {versionsLoading && (
                  <div className="text-center py-4 text-secondary">
                    <Spinner size="sm" className="me-2" />
                    {t("addons.loadingVersions")}
                  </div>
                )}
                {!versionsLoading && versions.length === 0 && (
                  <div className="text-secondary small">
                    {t("addons.noBuildsFor", { version: "" })}
                  </div>
                )}
                {!versionsLoading && versions.length > 0 && (
                  <ListGroup variant="flush" className="border rounded">
                    {versions.map((v, index) => (
                      <ListGroup.Item
                        key={v.versionId}
                        className="d-flex justify-content-between align-items-start gap-3 flex-wrap"
                      >
                        <div className="min-w-0">
                          <div className="fw-semibold d-flex flex-wrap align-items-center gap-1">
                            <span>{v.versionNumber}</span>
                            {index === 0 && (
                              <Badge bg="primary">{t("addons.latest")}</Badge>
                            )}
                            <Badge bg={channelBadge(v.releaseChannel)}>
                              {v.releaseChannel}
                            </Badge>
                          </div>
                          <div className="small text-secondary">
                            {v.gameVersions.slice(0, 6).join(", ")}
                            {v.gameVersions.length > 6
                              ? ` +${v.gameVersions.length - 6}`
                              : ""}
                            {v.fileSize > 0 ? ` · ${formatBytes(v.fileSize)}` : ""}
                            {v.datePublished
                              ? ` · ${formatWhen(v.datePublished)}`
                              : ""}
                          </div>
                        </div>
                        {canUpdate && (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={installing}
                            onClick={() => installVersion(v.versionId)}
                          >
                            {installing ? (
                              <Spinner size="sm" />
                            ) : (
                              t("addons.install")
                            )}
                          </Button>
                        )}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                )}
              </>
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
                  project &&
                  onInstall(project.projectId, project.title, project.iconUrl)
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
                project &&
                onInstall(project.projectId, project.title, project.iconUrl)
              }
            >
              {installing ? t("addons.working") : t("addons.chooseVersion")}
            </Button>
          ))}
      </Modal.Footer>
    </Modal>
  );
}
