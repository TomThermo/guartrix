import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AddonSortIndex, McServer } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatCount } from "../utils";
import { AddonDetailModal } from "./AddonDetailModal";
import { AddonVersionPickerModal } from "./AddonVersionPickerModal";

interface Props {
  server: McServer;
  canUpdate: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}

type Source = "modrinth" | "curseforge";

type ModpackHit = {
  key: string;
  projectId?: string;
  modId?: number;
  title: string;
  description: string;
  downloads: number;
  follows: number;
  author: string;
  iconUrl: string | null;
  categories: string[];
};

const SORT_OPTIONS: { value: AddonSortIndex; labelKey: string }[] = [
  { value: "relevance", labelKey: "addons.sortRelevance" },
  { value: "downloads", labelKey: "addons.sortDownloads" },
  { value: "follows", labelKey: "addons.sortFollows" },
  { value: "newest", labelKey: "addons.sortNewest" },
  { value: "updated", labelKey: "addons.sortUpdated" },
];

function normalizeHit(hit: Record<string, unknown>, source: Source): ModpackHit {
  if (source === "curseforge") {
    const authors = Array.isArray(hit.authors)
      ? (hit.authors as Array<{ name?: string }>)
      : [];
    const logo =
      hit.logo && typeof hit.logo === "object"
        ? (hit.logo as { thumbnailUrl?: string; url?: string })
        : null;
    const categories = Array.isArray(hit.categories)
      ? (hit.categories as Array<{ name?: string }>)
          .map((c) => c.name)
          .filter((n): n is string => Boolean(n))
      : [];
    return {
      key: String(hit.id ?? hit.slug ?? ""),
      modId: Number(hit.id),
      title: String(hit.name ?? hit.title ?? hit.id ?? "modpack"),
      description: String(hit.summary ?? hit.description ?? ""),
      downloads: Number(hit.downloadCount ?? hit.downloads ?? 0),
      follows: Number(hit.thumbsUpCount ?? hit.follows ?? 0),
      author: String(authors[0]?.name ?? ""),
      iconUrl: logo?.thumbnailUrl || logo?.url || null,
      categories,
    };
  }

  const categories = Array.isArray(hit.categories)
    ? (hit.categories as string[]).filter(Boolean)
    : Array.isArray(hit.display_categories)
      ? (hit.display_categories as string[]).filter(Boolean)
      : [];
  return {
    key: String(hit.project_id ?? hit.slug ?? hit.id ?? ""),
    projectId: String(hit.project_id ?? hit.slug ?? ""),
    title: String(hit.title ?? hit.name ?? "modpack"),
    description: String(hit.description ?? ""),
    downloads: Number(hit.downloads ?? 0),
    follows: Number(hit.follows ?? 0),
    author: String(hit.author ?? ""),
    iconUrl: typeof hit.icon_url === "string" ? hit.icon_url : null,
    categories,
  };
}

export function ModpackPanel({
  server,
  canUpdate,
  onNotice,
  onError,
}: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState<Source>("modrinth");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AddonSortIndex>("relevance");
  const [hits, setHits] = useState<ModpackHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [offset, setOffset] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [installPick, setInstallPick] = useState<{
    projectId: string;
    title: string;
    iconUrl?: string | null;
  } | null>(null);
  const limit = 24;
  const browseAbortRef = useRef<AbortController | null>(null);
  const browseSeqRef = useRef(0);

  const kind = addonKindFor(server.type);
  const supports =
    server.type === "FABRIC" ||
    server.type === "QUILT" ||
    server.type === "FORGE" ||
    server.type === "NEOFORGE";

  const browse = useCallback(
    async (nextOffset = 0, append = false) => {
      if (!supports) return;
      browseAbortRef.current?.abort();
      const ac = new AbortController();
      browseAbortRef.current = ac;
      const seq = ++browseSeqRef.current;
      setSearching(true);
      onError(null);
      try {
        const res = await api.searchModpacks(server.id, {
          q: query,
          source,
          index: source === "modrinth" ? sort : undefined,
          offset: nextOffset,
          limit,
        });
        if (seq !== browseSeqRef.current) return;
        const next = res.hits.map((h) => normalizeHit(h, source));
        setHits((prev) => (append ? [...prev, ...next] : next));
        setTotalHits(res.totalHits);
        setOffset(nextOffset);
        setConfigured(res.configured !== false);
      } catch (err) {
        if (ac.signal.aborted || seq !== browseSeqRef.current) return;
        onError(err instanceof Error ? err.message : t("modpacks.searchFailed"));
        if (!append) {
          setHits([]);
          setTotalHits(0);
        }
      } finally {
        if (seq === browseSeqRef.current) setSearching(false);
      }
    },
    [supports, server.id, query, source, sort, onError, t],
  );

  useEffect(() => {
    if (!supports) return;
    void browse(0, false);
    return () => {
      browseAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when source/sort change
  }, [supports, source, sort, server.id]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await browse(0, false);
  }

  function openInstallPicker(hit: Pick<ModpackHit, "projectId" | "title" | "iconUrl">) {
    if (!canUpdate || !hit.projectId) return;
    setInstallPick({
      projectId: hit.projectId,
      title: hit.title,
      iconUrl: hit.iconUrl,
    });
  }

  async function installModrinth(projectId: string, versionId: string) {
    if (!canUpdate) return;
    const running =
      server.status === "RUNNING" || server.status === "STARTING";
    if (running) {
      onError(t("modpacks.stopFirst"));
      return;
    }
    setInstalling(projectId);
    onError(null);
    onNotice(null);
    try {
      const result = await api.installModpack(server.id, {
        source: "modrinth",
        projectId,
        versionId,
      });
      onNotice(
        t("modpacks.noticeInstalled", {
          title: result.title,
          version: result.versionNumber,
          count: result.filesInstalled,
        }),
      );
      setInstallPick(null);
      setDetailProjectId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.installFailed"));
    } finally {
      setInstalling(null);
    }
  }

  async function installCurseforge(hit: ModpackHit) {
    if (!canUpdate) return;
    const running =
      server.status === "RUNNING" || server.status === "STARTING";
    if (running) {
      onError(t("modpacks.stopFirst"));
      return;
    }
    if (!confirm(t("modpacks.confirmInstall", { title: hit.title }))) {
      return;
    }
    if (!Number.isFinite(hit.modId)) {
      onError("Missing CurseForge mod id");
      return;
    }
    setInstalling(hit.key);
    onError(null);
    onNotice(null);
    try {
      const result = await api.installModpack(server.id, {
        source: "curseforge",
        modId: hit.modId,
      });
      onNotice(
        t("modpacks.noticeInstalled", {
          title: result.title,
          version: result.versionNumber,
          count: result.filesInstalled,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.installFailed"));
    } finally {
      setInstalling(null);
    }
  }

  if (!supports || kind !== "mod") {
    return (
      <Alert variant="light" className="border">
        {t("modpacks.unsupported")}
      </Alert>
    );
  }

  const canLoadMore = hits.length < totalHits;

  return (
    <div>
      <h2 className="h5 mb-3">{t("modpacks.title")}</h2>
      <p className="text-secondary small">{t("modpacks.help")}</p>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="h6 mb-0">
          <i className="fa-solid fa-cubes me-2" />
          {t("modpacks.browse")}
        </h3>
        <span className="small text-secondary">
          {t("addons.results", { count: totalHits.toLocaleString() })}
        </span>
      </div>

      <Form onSubmit={(e) => void onSearch(e)} className="mb-3">
        <Row className="g-2">
          <Col md={3}>
            <Form.Select
              size="sm"
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              aria-label={t("modpacks.source")}
            >
              <option value="modrinth">Modrinth</option>
              <option value="curseforge">CurseForge</option>
            </Form.Select>
          </Col>
          <Col md={source === "modrinth" ? 4 : 6}>
            <Form.Control
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("modpacks.search")}
            />
          </Col>
          {source === "modrinth" && (
            <Col md={3}>
              <Form.Select
                size="sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as AddonSortIndex)}
                aria-label={t("addons.sortBy")}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </Form.Select>
            </Col>
          )}
          <Col md="auto">
            <Button size="sm" variant="primary" type="submit" disabled={searching}>
              {searching ? <Spinner size="sm" /> : t("common.search")}
            </Button>
          </Col>
        </Row>
      </Form>

      {source === "curseforge" && !configured && (
        <Alert variant="warning">{t("modpacks.curseforgeMissing")}</Alert>
      )}

      {searching && hits.length === 0 && (
        <Alert variant="light" className="border small py-2 mb-3">
          <Spinner size="sm" className="me-2" />
          {t("modpacks.searchingLibrary")}
        </Alert>
      )}

      <ListGroup className="mb-3">
        {hits.length === 0 && !searching && (
          <ListGroup.Item className="text-secondary">
            {t("modpacks.noResults")}
          </ListGroup.Item>
        )}
        {hits.map((h) => {
          const clickable = source === "modrinth" && Boolean(h.projectId);
          return (
            <ListGroup.Item
              key={h.key}
              className={`d-flex justify-content-between align-items-start gap-3 flex-wrap${
                clickable ? " addon-row-clickable" : ""
              }`}
              onClick={
                clickable
                  ? () => setDetailProjectId(h.projectId!)
                  : undefined
              }
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailProjectId(h.projectId!);
                      }
                    }
                  : undefined
              }
            >
              <div className="d-flex gap-2 min-w-0">
                {h.iconUrl ? (
                  <img
                    className="addon-icon"
                    src={h.iconUrl}
                    alt=""
                    width={40}
                    height={40}
                  />
                ) : (
                  <div className="addon-icon addon-icon-fallback d-grid place-items-center">
                    <i className="fa-solid fa-cubes text-secondary" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="fw-semibold">{h.title}</div>
                  <div className="small text-secondary">
                    {h.author
                      ? `${t("addons.byAuthor", { author: h.author })} · `
                      : ""}
                    {t("addons.downloadsCount", {
                      count: formatCount(h.downloads),
                    })}
                    {h.follows > 0
                      ? ` · ${t("addons.likesCount", {
                          count: formatCount(h.follows),
                        })}`
                      : ""}
                  </div>
                  {h.categories.length > 0 && (
                    <Stack
                      direction="horizontal"
                      gap={1}
                      className="flex-wrap mt-1"
                    >
                      {h.categories.slice(0, 4).map((c) => (
                        <Badge key={c} bg="secondary">
                          {c}
                        </Badge>
                      ))}
                    </Stack>
                  )}
                  <p className="small text-secondary mb-0 mt-1">{h.description}</p>
                </div>
              </div>
              {canUpdate && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!!installing}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (source === "curseforge") {
                      void installCurseforge(h);
                    } else {
                      openInstallPicker(h);
                    }
                  }}
                >
                  {installing === (h.projectId ?? h.key) ? (
                    <Spinner size="sm" />
                  ) : (
                    t("modpacks.install")
                  )}
                </Button>
              )}
            </ListGroup.Item>
          );
        })}
      </ListGroup>

      {canLoadMore && (
        <div className="text-center">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={searching}
            onClick={() => void browse(offset + limit, true)}
          >
            {searching ? t("common.loading") : t("addons.loadMore")}
          </Button>
        </div>
      )}

      {detailProjectId && source === "modrinth" && (
        <AddonDetailModal
          serverId={server.id}
          projectId={detailProjectId}
          installed={false}
          installing={installing === detailProjectId}
          canUpdate={canUpdate}
          onClose={() => setDetailProjectId(null)}
          onInstall={(id, title, iconUrl) => {
            openInstallPicker({
              projectId: id,
              title,
              iconUrl: iconUrl ?? null,
            });
          }}
          onError={onError}
        />
      )}

      {installPick && (
        <AddonVersionPickerModal
          serverId={server.id}
          projectId={installPick.projectId}
          title={installPick.title}
          iconUrl={installPick.iconUrl}
          mcVersion={server.mcVersion}
          mode="install"
          installing={installing === installPick.projectId}
          onClose={() => {
            if (installing !== installPick.projectId) setInstallPick(null);
          }}
          onInstall={(id, versionId) => void installModrinth(id, versionId)}
          onError={onError}
        />
      )}
    </div>
  );
}
