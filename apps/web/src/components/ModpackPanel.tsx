import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AddonSortIndex, McServer } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import { Alert } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { AddonDetailModal } from "./AddonDetailModal";
import { AbortableBrowse } from "./addon-panel/abortableBrowse";
import { AddonVersionPickerModal } from "./AddonVersionPickerModal";
import { ModpackSearch } from "./modpack/ModpackSearch";
import {
  normalizeModpackHit,
  type ModpackHit,
  type ModpackSource,
} from "./modpack/normalizeHit";

interface Props {
  server: McServer;
  canUpdate: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}

export function ModpackPanel({
  server,
  canUpdate,
  onNotice,
  onError,
}: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState<ModpackSource>("modrinth");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AddonSortIndex>("relevance");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<
    Array<{ name: string; label: string }>
  >([]);
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
  const browseGateRef = useRef(new AbortableBrowse());

  const kind = addonKindFor(server.type);
  const supports =
    server.type === "FABRIC" ||
    server.type === "QUILT" ||
    server.type === "FORGE" ||
    server.type === "NEOFORGE";

  const browse = useCallback(
    async (nextOffset = 0, append = false) => {
      if (!supports) return;
      const { signal, seq } = browseGateRef.current.begin();
      setSearching(true);
      onError(null);
      try {
        const res = await api.searchModpacks(server.id, {
          q: query,
          source,
          category:
            source === "modrinth" && category ? category : undefined,
          index: source === "modrinth" ? sort : undefined,
          offset: nextOffset,
          limit,
        });
        if (!browseGateRef.current.isCurrent(seq)) return;
        const next = res.hits.map((h) => normalizeModpackHit(h, source));
        setHits((prev) => (append ? [...prev, ...next] : next));
        setTotalHits(res.totalHits);
        setOffset(nextOffset);
        setConfigured(res.configured !== false);
      } catch (err) {
        if (browseGateRef.current.isStale(seq, signal)) return;
        onError(err instanceof Error ? err.message : t("modpacks.searchFailed"));
        if (!append) {
          setHits([]);
          setTotalHits(0);
        }
      } finally {
        if (browseGateRef.current.isCurrent(seq)) setSearching(false);
      }
    },
    [supports, server.id, query, source, category, sort, onError, t],
  );

  useEffect(() => {
    if (!supports) return;
    void api
      .listModpackCategories(server.id)
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, [supports, server.id]);

  useEffect(() => {
    if (!supports) return;
    if (source === "curseforge" && category) setCategory("");
    void browse(0, false);
    return () => {
      browseGateRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters change
  }, [supports, source, sort, category, server.id]);

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

      <ModpackSearch
        source={source}
        query={query}
        sort={sort}
        category={category}
        categories={categories}
        hits={hits}
        totalHits={totalHits}
        searching={searching}
        configured={configured}
        canLoadMore={canLoadMore}
        installing={installing}
        canUpdate={canUpdate}
        onSourceChange={setSource}
        onQueryChange={setQuery}
        onSortChange={setSort}
        onCategoryChange={setCategory}
        onSearch={(e) => void onSearch(e)}
        onSelectHit={setDetailProjectId}
        onInstallHit={(h) => {
          if (source === "curseforge") {
            void installCurseforge(h);
          } else {
            openInstallPicker(h);
          }
        }}
        onLoadMore={() => void browse(offset + limit, true)}
      />

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
          onInstallVersion={(id, versionId) => {
            void installModrinth(id, versionId);
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
