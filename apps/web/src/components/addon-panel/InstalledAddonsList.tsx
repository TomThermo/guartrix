import type { InstalledAddon, InstalledAddonUpdate } from "@guartrix/shared";
import { Badge, Button, Col, Row, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { EmptyState } from "../EmptyState";

interface Props {
  installed: InstalledAddon[];
  updates: Record<string, InstalledAddonUpdate>;
  checkingUpdates: boolean;
  updateCount: number;
  canUpdate: boolean;
  busyId: string | null;
  updatingAll: boolean;
  syncing: boolean;
  /** "plugins" or "mods" — used in the sync button tooltip. */
  syncFolderLabel: string;
  onUpgradeAll: () => void;
  onSyncFromDisk: () => void;
  onUpgradeAddon: (addon: InstalledAddon) => void;
  onUninstall: (projectId: string, title: string) => void;
  onOpenDetail: (projectId: string) => void;
  onOpenChangeVersion: (addon: InstalledAddon) => void;
}

export function InstalledAddonsList({
  installed,
  updates,
  checkingUpdates,
  updateCount,
  canUpdate,
  busyId,
  updatingAll,
  syncing,
  syncFolderLabel,
  onUpgradeAll,
  onSyncFromDisk,
  onUpgradeAddon,
  onUninstall,
  onOpenDetail,
  onOpenChangeVersion,
}: Props) {
  const { t } = useI18n();

  return (
    <>
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
              onClick={() => onUpgradeAll()}
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
              onClick={() => onSyncFromDisk()}
              title={t("addons.syncTitle", { folder: syncFolderLabel })}
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
        <EmptyState message={t("addons.empty")} className="mb-4" />
      ) : (
        <Row className="g-2 mb-4 installed-addons-grid">
          {installed.map((a) => {
            const update = updates[a.projectId];
            const hasUpdate = Boolean(update?.available);
            return (
              <Col key={`${a.projectId}:${a.fileName}`} xs={12} sm={6} lg={4}>
                <div
                  className={`installed-addon-card${a.source === "modrinth" ? " addon-row-clickable" : ""}${hasUpdate ? " has-update" : ""}`}
                  onClick={a.source === "modrinth" ? () => onOpenDetail(a.projectId) : undefined}
                  role={a.source === "modrinth" ? "button" : undefined}
                  tabIndex={a.source === "modrinth" ? 0 : undefined}
                  onKeyDown={
                    a.source === "modrinth"
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpenDetail(a.projectId);
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
                            onOpenChangeVersion(a);
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
                            onUpgradeAddon(a);
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
                          onUninstall(a.projectId, a.title);
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
    </>
  );
}
