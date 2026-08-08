import { lazy, Suspense } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { DiskUsageCard } from "./DiskUsageCard";
import { FileBrowserTable } from "./file-manager/FileBrowserTable";
import { FileContextMenu } from "./file-manager/FileContextMenu";
import { FileEditorTabs } from "./file-manager/FileEditorTabs";
import { FileManagerToolbar } from "./file-manager/FileManagerToolbar";
import { FileTree } from "./file-manager/FileTree";
import {
  useFileManagerActions,
  type FileManagerActionsProps,
} from "./file-manager/useFileManagerActions";
import { PromptModal } from "./PromptModal";

const FileEditorPane = lazy(() =>
  import("./file-manager/FileEditorPane").then((m) => ({ default: m.FileEditorPane })),
);

export function FileManager(props: FileManagerActionsProps) {
  const {
    t,
    serverId,
    diskMb,
    canUpdate,
    canCreate,
    canUpload,
    canDelete,
    canDownload,
    canArchive,
    cwd,
    entries,
    loading,
    busy,
    tabs,
    activePath,
    setActivePath,
    setPaneMode,
    newFolder,
    setNewFolder,
    selected,
    filter,
    setFilter,
    uploadProgress,
    dragActive,
    setDragActive,
    treeWidth,
    treeCollapsed,
    mobileTreeOpen,
    setMobileTreeOpen,
    treeRefreshKey,
    contextMenu,
    setContextMenu,
    disk,
    dialog,
    setDialog,
    dialogBusy,
    fileInputRef,
    activeTab,
    anyDirty,
    crumbs,
    allSelected,
    someSelected,
    showEditor,
    treeVisibleDesktop,
    treeVisibleMobile,
    askDiscard,
    runDialogAction,
    load,
    bumpTree,
    toggleSelect,
    toggleSelectAll,
    toggleTree,
    openEntry,
    goTo,
    updateActiveContent,
    saveFile,
    closeTab,
    onMkdir,
    onNewFile,
    onDelete,
    onRename,
    onUpload,
    onDownload,
    onDecompress,
    onCompressSelected,
    onDownloadSelectedArchive,
    onResizeStart,
  } = useFileManagerActions(props);

  return (
    <div className="file-manager">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
        <h2 className="h5 mb-0">{t("files.title")}</h2>
        {anyDirty && <span className="badge text-bg-warning">{t("files.unsavedTabs")}</span>}
      </div>
      {disk && <DiskUsageCard disk={disk} limitMb={diskMb} compact />}

      <FileManagerToolbar
        cwd={cwd}
        crumbs={crumbs}
        busy={busy}
        someSelected={someSelected}
        newFolder={newFolder}
        fileInputRef={fileInputRef}
        canCreate={canCreate}
        canUpload={canUpload}
        canDownload={canDownload}
        canArchive={canArchive}
        treeCollapsed={treeCollapsed && !mobileTreeOpen}
        onToggleTree={toggleTree}
        onGoTo={(path) => void goTo(path)}
        onRefresh={() => {
          void load(cwd);
          bumpTree();
        }}
        onNewFolderChange={setNewFolder}
        onMkdir={(e) => void onMkdir(e)}
        onNewFile={onNewFile}
        onUpload={(files) => void onUpload(files)}
        onCompressSelected={() => void onCompressSelected()}
        onDownloadSelectedArchive={() => void onDownloadSelectedArchive()}
      />

      <div className="file-workbench border rounded surface">
        <aside
          className={`file-workbench-tree${treeVisibleDesktop ? "" : " is-collapsed"}${
            treeVisibleMobile ? " is-mobile-open" : ""
          }`}
          style={treeVisibleDesktop ? { width: treeWidth, flexBasis: treeWidth } : undefined}
        >
          <FileTree
            serverId={serverId}
            cwd={cwd}
            activeFilePath={activePath}
            busy={busy}
            refreshKey={treeRefreshKey}
            onNavigate={(path) => void goTo(path)}
            onOpenFile={(entry) => void openEntry(entry)}
          />
        </aside>

        {treeVisibleDesktop && (
          <div
            className="file-workbench-resizer"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={onResizeStart}
          />
        )}

        <div className="file-workbench-main">
          <FileEditorTabs
            tabs={tabs.map(({ path, dirty }) => ({ path, dirty }))}
            activePath={showEditor ? activePath : null}
            busy={busy}
            onSelect={(path) => {
              setActivePath(path);
              setPaneMode("editor");
            }}
            onClose={closeTab}
          />

          {showEditor && activeTab ? (
            <Suspense
              fallback={
                <div className="file-editor-loading text-secondary small p-3">
                  {t("common.loading")}…
                </div>
              }
            >
              <FileEditorPane
                path={activeTab.path}
                content={activeTab.content}
                dirty={activeTab.dirty}
                busy={busy}
                canUpdate={canUpdate}
                onChange={updateActiveContent}
                onClose={() => closeTab(activeTab.path)}
                onSave={() => void saveFile()}
                onAskDiscard={askDiscard}
                onShowBrowser={() => setPaneMode("browser")}
              />
            </Suspense>
          ) : (
            <FileBrowserTable
              cwd={cwd}
              entries={entries}
              loading={loading}
              busy={busy}
              activeFilePath={activePath}
              selected={selected}
              allSelected={allSelected}
              canDownload={canDownload}
              canArchive={canArchive}
              canUpdate={canUpdate}
              canDelete={canDelete}
              canUpload={canUpload}
              filter={filter}
              uploadProgress={uploadProgress}
              dragActive={dragActive}
              onFilterChange={setFilter}
              onGoTo={goTo}
              onOpenEntry={openEntry}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onDownload={onDownload}
              onDecompress={onDecompress}
              onRename={onRename}
              onDelete={onDelete}
              onContextMenu={setContextMenu}
              onDragEnter={() => setDragActive(true)}
              onDragLeave={() => setDragActive(false)}
              onDropFiles={(files) => void onUpload(files)}
            />
          )}
        </div>
      </div>

      {mobileTreeOpen && (
        <button
          type="button"
          className="file-tree-backdrop"
          aria-label={t("files.hideTree")}
          onClick={() => setMobileTreeOpen(false)}
        />
      )}

      <FileContextMenu
        menu={contextMenu}
        canDownload={canDownload}
        canArchive={canArchive}
        canUpdate={canUpdate}
        canDelete={canDelete}
        busy={busy}
        onClose={() => setContextMenu(null)}
        onOpen={(entry) => void openEntry(entry)}
        onDownload={(entry) => void onDownload(entry)}
        onDecompress={onDecompress}
        onRename={onRename}
        onDelete={onDelete}
      />

      <ConfirmModal
        show={dialog?.kind === "confirm"}
        title={dialog?.kind === "confirm" ? dialog.title : ""}
        body={dialog?.kind === "confirm" ? dialog.body : ""}
        confirmLabel={dialog?.kind === "confirm" ? dialog.confirmLabel : undefined}
        variant={dialog?.kind === "confirm" ? dialog.variant : undefined}
        busy={dialogBusy}
        onCancel={() => {
          if (dialogBusy) return;
          setDialog(null);
        }}
        onConfirm={() => {
          if (dialog?.kind !== "confirm" || dialogBusy) return;
          void runDialogAction(dialog.onYes);
        }}
      />
      <PromptModal
        show={dialog?.kind === "prompt"}
        title={dialog?.kind === "prompt" ? dialog.title : ""}
        label={dialog?.kind === "prompt" ? dialog.label : ""}
        defaultValue={dialog?.kind === "prompt" ? dialog.defaultValue : ""}
        confirmLabel={dialog?.kind === "prompt" ? dialog.confirmLabel : undefined}
        busy={dialogBusy}
        onCancel={() => {
          if (dialogBusy) return;
          setDialog(null);
        }}
        onConfirm={(value) => {
          if (dialog?.kind !== "prompt" || dialogBusy) return;
          void runDialogAction(() => dialog.onYes(value));
        }}
      />
    </div>
  );
}
