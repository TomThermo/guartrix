import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AddonCategory,
  AddonSearchHit,
  AddonSortIndex,
  InstalledAddon,
  InstalledAddonUpdate,
  ServerType,
} from "@msm/shared";
import { addonKindFor, RECOMMENDED_PLUGIN_STACKS } from "@msm/shared";
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
  serverId: string;
  serverType: ServerType;
  mcVersion: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canUpdate?: boolean;
  /** Notify parent (sidebar badge) when the available update count changes. */
  onUpdateCountChange?: (count: number) => void;
}

const SORT_OPTIONS: { value: AddonSortIndex; labelKey: string }[] = [
  { value: "relevance", labelKey: "addons.sortRelevance" },
  { value: "downloads", labelKey: "addons.sortDownloads" },
  { value: "follows", labelKey: "addons.sortFollows" },
  { value: "newest", labelKey: "addons.sortNewest" },
  { value: "updated", labelKey: "addons.sortUpdated" },
];

export function AddonPanel({
  serverId,
  serverType,
  mcVersion,
  onError,
  onNotice,
  canUpdate = true,
  onUpdateCountChange,
}: Props) {
  const { t } = useI18n();
  const kind = addonKindFor(serverType);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [sort, setSort] = useState<AddonSortIndex>("relevance");
  const [categories, setCategories] = useState<AddonCategory[]>([]);
  const [hits, setHits] = useState<AddonSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [offset, setOffset] = useState(0);
  const [installed, setInstalled] = useState<InstalledAddon[]>([]);
  const [updates, setUpdates] = useState<Record<string, InstalledAddonUpdate>>({});
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [stackBusy, setStackBusy] = useState<string | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [installPick, setInstallPick] = useState<{
    projectId: string;
    title: string;
    iconUrl?: string | null;
    mode: "install" | "change";
    currentVersionId?: string | null;
  } | null>(null);
  const limit = 24;
  const browseAbortRef = useRef<AbortController | null>(null);
  const browseSeqRef = useRef(0);

  const refreshUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      const data = await api.listAddonUpdates(serverId);
      const map: Record<string, InstalledAddonUpdate> = {};
      for (const u of data.updates) map[u.projectId] = u;
      setUpdates(map);
      onUpdateCountChange?.(data.available);
    } catch {
      // non-fatal — Modrinth may be briefly unreachable
    } finally {
      setCheckingUpdates(false);
    }
  }, [serverId, onUpdateCountChange]);

  const refreshInstalled = useCallback(async (opts?: { checkUpdates?: boolean }) => {
    const data = await api.listAddons(serverId);
    setInstalled(data.installed);
    if (opts?.checkUpdates !== false) {
      // Defer so Modrinth search is not starved by N version lookups.
      window.setTimeout(() => {
        void refreshUpdates();
      }, 750);
    }
  }, [serverId, refreshUpdates]);

  const browse = useCallback(
    async (nextOffset = 0, append = false) => {
      if (!kind) return;
      browseAbortRef.current?.abort();
      const ac = new AbortController();
      browseAbortRef.current = ac;
      const seq = ++browseSeqRef.current;
      setSearching(true);
      onError(null);
      try {
        const data = await api.searchAddons(
          serverId,
          {
            q: query,
            category: category || undefined,
            index: sort,
            offset: nextOffset,
            limit,
          },
          ac.signal,
        );
        if (seq !== browseSeqRef.current) return;
        setHits((prev) => (append ? [...prev, ...data.hits] : data.hits));
        setTotalHits(data.totalHits);
        setOffset(nextOffset);
      } catch (err) {
        if (ac.signal.aborted || seq !== browseSeqRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        onError(err instanceof Error ? err.message : "Browse failed");
      } finally {
        if (seq === browseSeqRef.current) setSearching(false);
      }
    },
    [kind, serverId, query, category, sort, onError],
  );

  useEffect(() => {
    if (!kind) return;
    void refreshInstalled().catch((err) =>
      onError(err instanceof Error ? err.message : t("addons.loadFailed")),
    );
    void api
      .listAddonCategories(serverId)
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, [kind, refreshInstalled, onError, serverId]);

  useEffect(() => {
    if (!kind) return;
    void browse(0, false);
    return () => {
      browseAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters change, not query typing
  }, [kind, category, sort, serverId]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await browse(0, false);
  }

  function openInstallPicker(opts: {
    projectId: string;
    title: string;
    iconUrl?: string | null;
    mode?: "install" | "change";
    currentVersionId?: string | null;
  }) {
    if (!canUpdate) return;
    const mode = opts.mode ?? "install";
    if (
      mode === "install" &&
      installed.some((a) => a.projectId === opts.projectId)
    ) {
      return;
    }
    setInstallPick({
      projectId: opts.projectId,
      title: opts.title,
      iconUrl: opts.iconUrl,
      mode,
      currentVersionId: opts.currentVersionId ?? null,
    });
  }

  async function install(projectId: string, versionId?: string) {
    if (!canUpdate) return;
    const changing = installPick?.mode === "change";
    setBusyId(projectId);
    onError(null);
    onNotice(null);
    try {
      const result = await api.installAddon(serverId, projectId, versionId);
      setInstallPick(null);
      setDetailProjectId(null);
      await refreshInstalled();
      const deps = result.dependenciesInstalled;
      const depNames = deps.map((d) => d.title).join(", ");
      if (changing) {
        onNotice(
          t("addons.noticeSwitched", {
            title: result.installed.title,
            version: result.installed.versionNumber,
          }),
        );
      } else {
        onNotice(
          deps.length > 0
            ? t("addons.noticeInstalledDeps", {
                title: result.installed.title,
                version: result.installed.versionNumber,
                deps: depNames,
              })
            : t("addons.noticeInstalled", {
                title: result.installed.title,
                version: result.installed.versionNumber,
              }),
        );
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.installFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function upgradeAddon(addon: InstalledAddon) {
    const info = updates[addon.projectId];
    if (!info?.available) return;
    setBusyId(addon.projectId);
    onError(null);
    onNotice(null);
    try {
      const result = await api.installAddon(
        serverId,
        addon.projectId,
        info.latestVersionId,
      );
      await refreshInstalled();
      onNotice(
        t("addons.noticeUpdated", {
          title: result.installed.title,
          version: result.installed.versionNumber,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.updateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function upgradeAll() {
    if (!canUpdate) return;
    const pending = installed.filter((a) => updates[a.projectId]?.available);
    if (pending.length === 0) return;
    setUpdatingAll(true);
    onError(null);
    onNotice(null);
    let ok = 0;
    const failed: string[] = [];
    try {
      for (const addon of pending) {
        const info = updates[addon.projectId];
        if (!info?.available) continue;
        setBusyId(addon.projectId);
        try {
          await api.installAddon(serverId, addon.projectId, info.latestVersionId);
          ok += 1;
        } catch {
          failed.push(addon.title);
        }
      }
      await refreshInstalled();
      onNotice(
        failed.length
          ? t("addons.noticeUpdatedPartial", {
              ok,
              total: pending.length,
              failed: failed.join(", "),
            })
          : t("addons.noticeUpdatedAll", { count: ok }),
      );
    } finally {
      setBusyId(null);
      setUpdatingAll(false);
    }
  }

  async function uninstall(projectId: string, title: string) {
    if (!canUpdate) return;
    if (!confirm(t("addons.removeConfirm", { title }))) return;
    setBusyId(projectId);
    onError(null);
    onNotice(null);
    try {
      await api.uninstallAddon(serverId, projectId);
      await refreshInstalled();
      onNotice(t("addons.noticeRemoved", { title }));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.uninstallFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function syncFromDisk() {
    if (!canUpdate) return;
    setSyncing(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.syncAddons(serverId);
      setInstalled(result.installed);
      void refreshUpdates();
      const localCount = result.installed.filter((a) => a.source === "local").length;
      const parts = [
        t("addons.syncScanned", {
          count: result.jarCount,
          folder: result.folder,
        }),
        result.added.length
          ? t("addons.syncAdded", { count: result.added.length })
          : null,
        result.removed.length
          ? t("addons.syncRemoved", { count: result.removed.length })
          : null,
        localCount ? t("addons.syncLocal", { count: localCount }) : null,
        result.duplicates.length
          ? t("addons.syncDuplicates", { count: result.duplicates.length })
          : null,
      ].filter(Boolean);
      onNotice(`${parts.join(" · ")}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  const updateCount = Object.values(updates).filter((u) => u.available).length;
  const installedIds = new Set(installed.map((a) => a.projectId));
  const canLoadMore = hits.length < totalHits;

  if (!kind) {
    return (
      <Alert variant="light" className="border">
        {t("addons.vanillaNoLoader")}
      </Alert>
    );
  }

  const folder = kind === "plugin" ? "plugins/" : "mods/";

  return (
    <div>
      <h2 className="h5 mb-3">{t("addons.title")}</h2>
      <Alert variant="light" className="border small">
        {t("addons.helpLead")} <strong>{serverType}</strong> {t("addons.helpMid")}{" "}
        <strong>{mcVersion}</strong>. {t("addons.helpFolder", { folder })}{" "}
        {t("addons.helpDeps")} {t("addons.helpSyncBefore")}{" "}
        <strong>{t("addons.syncFromDisk")}</strong> {t("addons.helpSyncAfter")}
      </Alert>

      {kind === "plugin" && canUpdate && (
        <Alert variant="light" className="border mb-3">
          <div className="fw-semibold mb-2">
            <i className="fa-solid fa-layer-group me-2" />
            {t("addons.recommendedStacks")}
          </div>
          <Stack gap={2}>
            {RECOMMENDED_PLUGIN_STACKS.map((stack) => (
              <div
                key={stack.id}
                className="d-flex flex-wrap justify-content-between align-items-start gap-2"
              >
                <div className="min-w-0">
                  <div className="fw-semibold">{stack.name}</div>
                  <div className="small text-secondary">{stack.description}</div>
                  <div className="small text-secondary">
                    {stack.items.map((i) => i.name).join(" · ")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={stackBusy !== null || busyId !== null}
                  onClick={() => {
                    setStackBusy(stack.id);
                    onError(null);
                    void api
                      .installAddonStack(serverId, stack.id)
                      .then(async (res) => {
                        await refreshInstalled();
                        const errPart =
                          res.errors.length > 0
                            ? t("addons.stackErrors", {
                                count: res.errors.length,
                              })
                            : "";
                        onNotice(
                          t("addons.noticeStack", {
                            count: res.installed.length,
                            name: stack.name,
                            errors: errPart,
                          }),
                        );
                      })
                      .catch((err) =>
                        onError(
                          err instanceof Error
                            ? err.message
                            : t("addons.stackInstallFailed"),
                        ),
                      )
                      .finally(() => setStackBusy(null));
                  }}
                >
                  {stackBusy === stack.id ? (
                    <Spinner size="sm" />
                  ) : (
                    t("addons.install")
                  )}
                </Button>
              </div>
            ))}
          </Stack>
        </Alert>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h3 className="h6 mb-0">
          <i className="fa-solid fa-box-archive me-2" />
          {t("addons.installed")} ({installed.length})
          {checkingUpdates && (
            <span className="small text-secondary fw-normal ms-2">
              <Spinner size="sm" className="me-1" />
              {t("addons.checkingUpdates")}
            </span>
          )}
          {!checkingUpdates && updateCount > 0 && (
            <Badge bg="warning" text="dark" className="ms-2 align-middle">
              {updateCount === 1
                ? t("common.updateOne", { count: updateCount })
                : t("common.updateMany", { count: updateCount })}
            </Badge>
          )}
        </h3>
        <div className="d-flex flex-wrap gap-2">
          {canUpdate && updateCount > 0 && (
            <Button
              size="sm"
              variant="warning"
              disabled={updatingAll || syncing || busyId !== null}
              onClick={() => void upgradeAll()}
            >
              {updatingAll ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  {t("addons.updating")}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-arrow-up me-1" />
                  {t("addons.updateAll", { count: updateCount })}
                </>
              )}
            </Button>
          )}
          {canUpdate && (
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={syncing || busyId !== null || updatingAll}
              onClick={() => void syncFromDisk()}
              title={t("addons.syncTitle", {
                folder: kind === "plugin" ? "plugins" : "mods",
              })}
            >
              {syncing ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  {t("addons.syncing")}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-arrows-rotate me-1" />
                  {t("addons.syncFromDisk")}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {installed.length === 0 ? (
        <div className="text-secondary small mb-4">{t("addons.empty")}</div>
      ) : (
        <Row className="g-2 mb-4 installed-addons-grid">
          {installed.map((a) => {
            const update = updates[a.projectId];
            const hasUpdate = Boolean(update?.available);
            return (
            <Col key={`${a.projectId}:${a.fileName}`} xs={12} sm={6} lg={4}>
              <div
                className={`installed-addon-card${a.source === "modrinth" ? " addon-row-clickable" : ""}${hasUpdate ? " has-update" : ""}`}
                onClick={
                  a.source === "modrinth"
                    ? () => setDetailProjectId(a.projectId)
                    : undefined
                }
                role={a.source === "modrinth" ? "button" : undefined}
                tabIndex={a.source === "modrinth" ? 0 : undefined}
                onKeyDown={
                  a.source === "modrinth"
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailProjectId(a.projectId);
                        }
                      }
                    : undefined
                }
              >
                {a.iconUrl ? (
                  <img className="addon-icon" src={a.iconUrl} alt="" width={36} height={36} />
                ) : (
                  <div className="addon-icon addon-icon-fallback d-grid place-items-center">
                    <i className="fa-solid fa-puzzle-piece text-secondary" />
                  </div>
                )}
                <div className="installed-addon-copy min-w-0">
                  <div className="fw-semibold text-truncate" title={a.title}>
                    {a.title}
                    {a.source === "local" && (
                      <Badge bg="secondary" className="ms-2 align-middle">
                        {t("addons.local")}
                      </Badge>
                    )}
                    {hasUpdate && (
                      <Badge bg="warning" text="dark" className="ms-2 align-middle">
                        {t("addons.updateBadge")}
                      </Badge>
                    )}
                  </div>
                  <div className="small text-secondary text-truncate">
                    {a.source === "local" ? a.fileName : a.versionNumber}
                    {hasUpdate && update
                      ? ` → ${update.latestVersionNumber}`
                      : a.author
                        ? ` · ${a.author}`
                        : ""}
                  </div>
                </div>
                {canUpdate && (
                  <div className="installed-addon-actions">
                    {a.source === "modrinth" && (
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="installed-addon-remove"
                        disabled={busyId === a.projectId || updatingAll}
                        title={t("serverDetail.changeVersion")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openInstallPicker({
                            projectId: a.projectId,
                            title: a.title,
                            iconUrl: a.iconUrl,
                            mode: "change",
                            currentVersionId: a.versionId,
                          });
                        }}
                      >
                        <i className="fa-solid fa-code-branch" />
                      </Button>
                    )}
                    {hasUpdate && (
                      <Button
                        size="sm"
                        variant="warning"
                        className="installed-addon-remove"
                        disabled={busyId === a.projectId || updatingAll}
                        title={t("addons.updateTo", {
                          version: update?.latestVersionNumber ?? "",
                        })}
                        onClick={(e) => {
                          e.stopPropagation();
                          void upgradeAddon(a);
                        }}
                      >
                        {busyId === a.projectId ? (
                          <Spinner size="sm" />
                        ) : (
                          <i className="fa-solid fa-arrow-up" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="installed-addon-remove"
                      disabled={busyId === a.projectId || updatingAll}
                      title={t("addons.removeTitle", { title: a.title })}
                      onClick={(e) => {
                        e.stopPropagation();
                        void uninstall(a.projectId, a.title);
                      }}
                    >
                      <i className="fa-solid fa-trash" />
                    </Button>
                  </div>
                )}
              </div>
            </Col>
            );
          })}
        </Row>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="h6 mb-0">
          <i className="fa-solid fa-puzzle-piece me-2" />
          {t("addons.browseModrinth")}
        </h3>
        <span className="small text-secondary">
          {t("addons.results", { count: totalHits.toLocaleString() })}
        </span>
      </div>

      <Form onSubmit={(e) => void onSearch(e)} className="mb-3">
        <Row className="g-2">
          <Col md={6}>
            <Form.Control
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("addons.search")}
            />
          </Col>
          <Col md={4}>
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
          <Col md="auto">
            <Button size="sm" variant="primary" type="submit" disabled={searching}>
              {searching ? <Spinner size="sm" /> : t("common.search")}
            </Button>
          </Col>
        </Row>
      </Form>

      {searching && (
        <Alert variant="light" className="border small py-2 mb-3">
          <Spinner size="sm" className="me-2" />
          {t("addons.searchingLibrary")}
        </Alert>
      )}

      <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
        <Button
          size="sm"
          variant={category === "" ? "primary" : "outline-secondary"}
          onClick={() => setCategory("")}
        >
          {t("common.all")}
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.name}
            size="sm"
            variant={category === cat.name ? "primary" : "outline-secondary"}
            onClick={() => setCategory(cat.name)}
          >
            {cat.label}
          </Button>
        ))}
      </Stack>

      <ListGroup className="mb-3">
        {hits.length === 0 && !searching && (
          <ListGroup.Item className="text-secondary">
            {t("addons.empty")}
          </ListGroup.Item>
        )}
        {hits.map((h) => (
          <ListGroup.Item
            key={h.projectId}
            className="d-flex justify-content-between align-items-start gap-3 flex-wrap addon-row-clickable"
            onClick={() => setDetailProjectId(h.projectId)}
          >
            <div className="d-flex gap-2 min-w-0">
              {h.iconUrl ? (
                <img className="addon-icon" src={h.iconUrl} alt="" width={40} height={40} />
              ) : (
                <div className="addon-icon addon-icon-fallback d-grid place-items-center">
                  <i className="fa-solid fa-puzzle-piece text-secondary" />
                </div>
              )}
              <div className="min-w-0">
                <div className="fw-semibold">{h.title}</div>
                <div className="small text-secondary">
                  {t("addons.byAuthor", { author: h.author })} ·{" "}
                  {t("addons.downloadsCount", {
                    count: formatCount(h.downloads),
                  })}{" "}
                  ·{" "}
                  {t("addons.likesCount", { count: formatCount(h.follows) })}
                </div>
                {h.categories.length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {h.categories.slice(0, 4).map((c) => (
                      <Badge
                        key={c}
                        bg="secondary"
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCategory(c);
                        }}
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="small text-secondary mb-0 mt-1">{h.description}</p>
              </div>
            </div>
            {canUpdate && (
              <Button
                size="sm"
                variant="primary"
                disabled={busyId === h.projectId || installedIds.has(h.projectId)}
                onClick={(e) => {
                  e.stopPropagation();
                  openInstallPicker({
                    projectId: h.projectId,
                    title: h.title,
                    iconUrl: h.iconUrl,
                    mode: "install",
                  });
                }}
              >
                {installedIds.has(h.projectId)
                  ? t("addons.installed")
                  : busyId === h.projectId
                    ? t("common.creating")
                    : t("addons.install")}
              </Button>
            )}
          </ListGroup.Item>
        ))}
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

      {detailProjectId && (
        <AddonDetailModal
          serverId={serverId}
          projectId={detailProjectId}
          installed={installedIds.has(detailProjectId)}
          installing={busyId === detailProjectId}
          canUpdate={canUpdate}
          onClose={() => setDetailProjectId(null)}
          onInstall={(id, title, iconUrl) => {
            const existing = installed.find((a) => a.projectId === id);
            if (existing) {
              openInstallPicker({
                projectId: id,
                title,
                iconUrl,
                mode: "change",
                currentVersionId: existing.versionId,
              });
            } else {
              openInstallPicker({ projectId: id, title, iconUrl, mode: "install" });
            }
          }}
          onUninstall={(id) => {
            const addon = installed.find((a) => a.projectId === id);
            void uninstall(id, addon?.title ?? id).then(() => setDetailProjectId(null));
          }}
          onError={onError}
        />
      )}

      {installPick && (
        <AddonVersionPickerModal
          serverId={serverId}
          projectId={installPick.projectId}
          title={installPick.title}
          iconUrl={installPick.iconUrl}
          mcVersion={mcVersion}
          mode={installPick.mode}
          currentVersionId={installPick.currentVersionId}
          installing={busyId === installPick.projectId}
          onClose={() => {
            if (busyId !== installPick.projectId) setInstallPick(null);
          }}
          onInstall={(id, versionId) => void install(id, versionId)}
          onError={onError}
        />
      )}
    </div>
  );
}
