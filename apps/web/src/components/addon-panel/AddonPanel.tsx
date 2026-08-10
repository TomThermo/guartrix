import type { ServerType } from "@msm/shared";
import { Alert } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { AddonDetailModal } from "./AddonDetailModal";
import { AddonVersionPickerModal } from "./AddonVersionPickerModal";
import { AddonSearch } from "./AddonSearch";
import { InstalledAddonsList } from "./InstalledAddonsList";
import { RecommendedStacks } from "./RecommendedStacks";
import { useAddonPanel } from "./useAddonPanel";

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

export function AddonPanel({
  serverId,
  serverType,
  mcVersion,
  onError,
  onNotice,
  canUpdate = true,
  onUpdateCountChange,
}: Props) {
  const panel = useAddonPanel({
    serverId,
    serverType,
    onError,
    onNotice,
    canUpdate,
    onUpdateCountChange,
  });
  const { t } = useI18n();

  if (!panel.kind) {
    return (
      <Alert variant="light" className="border">
        {t("addons.vanillaNoLoader")}
      </Alert>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-3">{t("addons.title")}</h2>
      <Alert variant="light" className="border small">
        {t("addons.helpLead")} <strong>{serverType}</strong> {t("addons.helpMid")}{" "}
        <strong>{mcVersion}</strong>. {t("addons.helpFolder", { folder: panel.folder })}{" "}
        {t("addons.helpDeps")} {t("addons.helpSyncBefore")}{" "}
        <strong>{t("addons.syncFromDisk")}</strong> {t("addons.helpSyncAfter")}
      </Alert>

      {panel.kind === "plugin" && canUpdate && (
        <RecommendedStacks
          serverId={serverId}
          busyId={panel.busyId}
          stackBusy={panel.stackBusy}
          setStackBusy={panel.setStackBusy}
          onError={onError}
          onNotice={onNotice}
          onInstalled={() => panel.refreshInstalled()}
        />
      )}

      <InstalledAddonsList
        installed={panel.installed}
        updates={panel.updates}
        checkingUpdates={panel.checkingUpdates}
        updateCount={panel.updateCount}
        canUpdate={canUpdate}
        busyId={panel.busyId}
        updatingAll={panel.updatingAll}
        syncing={panel.syncing}
        syncFolderLabel={panel.kind === "plugin" ? "plugins" : "mods"}
        onUpgradeAll={() => void panel.upgradeAll()}
        onSyncFromDisk={() => void panel.syncFromDisk()}
        onUpgradeAddon={(addon) => void panel.upgradeAddon(addon)}
        onUninstall={(projectId, title) => void panel.uninstall(projectId, title)}
        onOpenDetail={(projectId) => panel.setDetailProjectId(projectId)}
        onOpenChangeVersion={(addon) =>
          panel.openInstallPicker({
            projectId: addon.projectId,
            title: addon.title,
            iconUrl: addon.iconUrl,
            mode: "change",
            currentVersionId: addon.versionId,
          })
        }
      />

      <AddonSearch
        query={panel.query}
        category={panel.category}
        sort={panel.sort}
        categories={panel.categories}
        hits={panel.hits}
        totalHits={panel.totalHits}
        searching={panel.searching}
        canLoadMore={panel.canLoadMore}
        installedIds={panel.installedIds}
        busyId={panel.busyId}
        canUpdate={canUpdate}
        onQueryChange={panel.setQuery}
        onCategoryChange={panel.setCategory}
        onSortChange={panel.setSort}
        onSearch={(e) => void panel.onSearch(e)}
        onSelectHit={(projectId) => panel.setDetailProjectId(projectId)}
        onInstallHit={(hit) =>
          panel.openInstallPicker({
            projectId: hit.projectId,
            title: hit.title,
            iconUrl: hit.iconUrl,
            mode: "install",
          })
        }
        onLoadMore={() => void panel.browse(panel.offset + panel.limit, true)}
      />

      {panel.detailProjectId && (
        <AddonDetailModal
          serverId={serverId}
          projectId={panel.detailProjectId}
          installed={panel.installedIds.has(panel.detailProjectId)}
          installing={panel.busyId === panel.detailProjectId}
          canUpdate={canUpdate}
          onClose={() => panel.setDetailProjectId(null)}
          onInstall={(id, title, iconUrl) => {
            const existing = panel.installed.find((a) => a.projectId === id);
            if (existing) {
              panel.openInstallPicker({
                projectId: id,
                title,
                iconUrl,
                mode: "change",
                currentVersionId: existing.versionId,
              });
            } else {
              panel.openInstallPicker({ projectId: id, title, iconUrl, mode: "install" });
            }
          }}
          onInstallVersion={(id, versionId) => {
            void panel.install(id, versionId).then(() => panel.setDetailProjectId(null));
          }}
          onUninstall={(id) => {
            const addon = panel.installed.find((a) => a.projectId === id);
            void panel.uninstall(id, addon?.title ?? id).then(() => panel.setDetailProjectId(null));
          }}
          onError={onError}
        />
      )}

      {panel.installPick && (
        <AddonVersionPickerModal
          serverId={serverId}
          projectId={panel.installPick.projectId}
          title={panel.installPick.title}
          iconUrl={panel.installPick.iconUrl}
          mcVersion={mcVersion}
          mode={panel.installPick.mode}
          currentVersionId={panel.installPick.currentVersionId}
          installing={panel.busyId === panel.installPick.projectId}
          onClose={() => {
            if (panel.busyId !== panel.installPick!.projectId) panel.setInstallPick(null);
          }}
          onInstall={(id, versionId) => void panel.install(id, versionId)}
          onError={onError}
        />
      )}
    </div>
  );
}
