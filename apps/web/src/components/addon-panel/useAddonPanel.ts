import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AddonCategory,
  AddonSearchHit,
  AddonSortIndex,
  InstalledAddon,
  InstalledAddonUpdate,
  ServerType,
} from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { AbortableBrowse } from "./abortableBrowse";

export type InstallPick = {
  projectId: string;
  title: string;
  iconUrl?: string | null;
  mode: "install" | "change";
  currentVersionId?: string | null;
};

export function useAddonPanel({
  serverId,
  serverType,
  onError,
  onNotice,
  canUpdate = true,
  onUpdateCountChange,
}: {
  serverId: string;
  serverType: ServerType;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canUpdate?: boolean;
  onUpdateCountChange?: (count: number) => void;
}) {
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
  const [installPick, setInstallPick] = useState<InstallPick | null>(null);
  const limit = 24;
  const browseGateRef = useRef(new AbortableBrowse());

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

  const refreshInstalled = useCallback(
    async (opts?: { checkUpdates?: boolean }) => {
      const data = await api.listAddons(serverId);
      setInstalled(data.installed);
      if (opts?.checkUpdates !== false) {
        window.setTimeout(() => {
          void refreshUpdates();
        }, 750);
      }
    },
    [serverId, refreshUpdates],
  );

  const browse = useCallback(
    async (nextOffset = 0, append = false) => {
      if (!kind) return;
      const { signal, seq } = browseGateRef.current.begin();
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
          signal,
        );
        if (!browseGateRef.current.isCurrent(seq)) return;
        setHits((prev) => (append ? [...prev, ...data.hits] : data.hits));
        setTotalHits(data.totalHits);
        setOffset(nextOffset);
      } catch (err) {
        if (browseGateRef.current.isStale(seq, signal)) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        onError(err instanceof Error ? err.message : "Browse failed");
      } finally {
        if (browseGateRef.current.isCurrent(seq)) setSearching(false);
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
  }, [kind, refreshInstalled, onError, serverId, t]);

  useEffect(() => {
    if (!kind) return;
    void browse(0, false);
    return () => {
      browseGateRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters change, not query typing
  }, [kind, browse]);

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
    if (mode === "install" && installed.some((a) => a.projectId === opts.projectId)) {
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
      const result = await api.installAddon(serverId, addon.projectId, info.latestVersionId);
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
        result.added.length ? t("addons.syncAdded", { count: result.added.length }) : null,
        result.removed.length ? t("addons.syncRemoved", { count: result.removed.length }) : null,
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
  const folder = kind === "plugin" ? "plugins/" : "mods/";

  return {
    t,
    kind,
    query,
    setQuery,
    category,
    setCategory,
    sort,
    setSort,
    categories,
    hits,
    totalHits,
    offset,
    installed,
    updates,
    checkingUpdates,
    searching,
    busyId,
    syncing,
    updatingAll,
    stackBusy,
    setStackBusy,
    detailProjectId,
    setDetailProjectId,
    installPick,
    setInstallPick,
    limit,
    refreshInstalled,
    browse,
    onSearch,
    openInstallPicker,
    install,
    upgradeAddon,
    upgradeAll,
    uninstall,
    syncFromDisk,
    updateCount,
    installedIds,
    canLoadMore,
    folder,
    canUpdate,
  };
}
