import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { FileEntry } from "@msm/shared";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { ConfirmModal } from "./ConfirmModal";
import { DiskUsageCard } from "./DiskUsageCard";
import { FileBrowserTable } from "./file-manager/FileBrowserTable";
import {
  FileContextMenu,
  type ContextMenuState,
} from "./file-manager/FileContextMenu";
import { FileEditorPane } from "./file-manager/FileEditorPane";
import { FileEditorTabs } from "./file-manager/FileEditorTabs";
import { FileManagerToolbar } from "./file-manager/FileManagerToolbar";
import { FileTree } from "./file-manager/FileTree";
import { joinPath, parentPath } from "./file-manager/paths";
import {
  canViewFileContents,
  shouldDownloadInsteadOfEdit,
} from "./file-manager/file-permissions";
import { useFileDiskPoll } from "./file-manager/useFileDiskPoll";
import { PromptModal } from "./PromptModal";

type Dialog =
  | {
      kind: "confirm";
      title: string;
      body: string;
      confirmLabel?: string;
      variant?: "danger" | "primary" | "warning";
      onYes: () => void | Promise<void>;
    }
  | {
      kind: "prompt";
      title: string;
      label: string;
      defaultValue: string;
      confirmLabel?: string;
      onYes: (v: string) => void | Promise<void>;
    }
  | null;

interface EditorTab {
  path: string;
  content: string;
  dirty: boolean;
}

type PaneMode = "browser" | "editor";

const TREE_WIDTH_KEY = "guartrix-fm-tree-width";
const TREE_COLLAPSED_KEY = "guartrix-fm-tree-collapsed";
const DEFAULT_TREE_WIDTH = 240;
const MIN_TREE_WIDTH = 160;
const MAX_TREE_WIDTH = 420;

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
  diskMb?: number;
  active?: boolean;
  canReadContent?: boolean;
  canUpdate?: boolean;
  canCreate?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  canDownload?: boolean;
  canArchive?: boolean;
}

function readStoredWidth(): number {
  try {
    const n = Number(localStorage.getItem(TREE_WIDTH_KEY));
    if (Number.isFinite(n) && n >= MIN_TREE_WIDTH && n <= MAX_TREE_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_TREE_WIDTH;
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(TREE_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function FileManager({
  serverId,
  onError,
  diskMb,
  active = true,
  canReadContent = true,
  canUpdate = true,
  canCreate = true,
  canUpload = true,
  canDelete = true,
  canDownload = true,
  canArchive = true,
}: Props) {
  const { t } = useI18n();
  const [cwd, setCwd] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>("browser");
  const [newFolder, setNewFolder] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [treeWidth, setTreeWidth] = useState(readStoredWidth);
  const [treeCollapsed, setTreeCollapsed] = useState(readStoredCollapsed);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const disk = useFileDiskPoll(serverId, active);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizingRef = useRef(false);
  const treeWidthRef = useRef(treeWidth);
  treeWidthRef.current = treeWidth;

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const anyDirty = tabs.some((tab) => tab.dirty);

  function bumpTree() {
    setTreeRefreshKey((k) => k + 1);
  }

  function askDiscard(onYes: () => void | Promise<void>) {
    setDialog({
      kind: "confirm",
      title: t("files.discardTitle"),
      body: t("files.discardBody"),
      confirmLabel: t("files.discard"),
      variant: "warning",
      onYes,
    });
  }

  async function runDialogAction(action: () => void | Promise<void>) {
    setDialogBusy(true);
    try {
      await action();
      setDialog(null);
    } finally {
      setDialogBusy(false);
    }
  }

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      onError(null);
      try {
        const data = await api.listFiles(serverId, path);
        setCwd(data.path || ".");
        setEntries(data.entries);
        setSelected(new Set());
        setFilter("");
      } catch (err) {
        onError(err instanceof Error ? err.message : t("files.listFailed"));
      } finally {
        setLoading(false);
      }
    },
    [serverId, onError, t],
  );

  useEffect(() => {
    void load(".");
  }, [load]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      const next = Math.min(
        MAX_TREE_WIDTH,
        Math.max(MIN_TREE_WIDTH, e.clientX - 24),
      );
      treeWidthRef.current = next;
      setTreeWidth(next);
    }
    function onUp() {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.classList.remove("file-fm-resizing");
      try {
        localStorage.setItem(TREE_WIDTH_KEY, String(treeWidthRef.current));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const crumbs = cwd === "." || !cwd ? [] : cwd.split("/").filter(Boolean);
  const allSelected = entries.length > 0 && selected.size === entries.length;
  const someSelected = selected.size > 0;

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(entries.map((e) => e.path)));
  }

  function toggleTree() {
    const mobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767.98px)").matches;
    if (mobile) {
      setMobileTreeOpen((open) => !open);
      return;
    }
    setTreeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TREE_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function openFileAtPath(path: string) {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      setActivePath(path);
      setPaneMode("editor");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const data = await api.readFile(serverId, path);
      setTabs((prev) => [
        ...prev,
        { path: data.path, content: data.content, dirty: false },
      ]);
      setActivePath(data.path);
      setPaneMode("editor");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.openFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function openEntry(entry: FileEntry) {
    if (entry.type === "dir") {
      setPaneMode("browser");
      setMobileTreeOpen(false);
      await load(entry.path);
      return;
    }
    if (!entry.editable) {
      if (shouldDownloadInsteadOfEdit(entry, { canDownload })) {
        await onDownload(entry);
        return;
      }
      onError(t("files.notEditable"));
      return;
    }
    if (!canViewFileContents({ canReadContent })) {
      onError(t("files.noReadPermission"));
      return;
    }
    setMobileTreeOpen(false);
    await openFileAtPath(entry.path);
  }

  async function goTo(path: string) {
    setPaneMode("browser");
    setMobileTreeOpen(false);
    await load(path);
  }

  function updateActiveContent(content: string) {
    if (!activePath) return;
    setTabs((prev) =>
      prev.map((tab) =>
        tab.path === activePath ? { ...tab, content, dirty: true } : tab,
      ),
    );
  }

  async function saveFile() {
    if (!activeTab || !canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      await api.writeFile(serverId, activeTab.path, activeTab.content);
      setTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTab.path ? { ...tab, dirty: false } : tab,
        ),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function closeTab(path: string) {
    const tab = tabs.find((t) => t.path === path);
    const doClose = () => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        if (activePath === path) {
          const idx = prev.findIndex((t) => t.path === path);
          const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null;
          setActivePath(fallback?.path ?? null);
          if (!fallback) setPaneMode("browser");
        }
        return next;
      });
    };
    if (tab?.dirty) {
      askDiscard(doClose);
      return;
    }
    doClose();
  }

  async function onMkdir(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const name = newFolder.trim();
    if (!name) return;
    setBusy(true);
    onError(null);
    try {
      const target = joinPath(cwd === "." || !cwd ? "." : cwd, name);
      await api.mkdir(serverId, target);
      setNewFolder("");
      await load(cwd);
      bumpTree();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.mkdirFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onNewFile() {
    if (!canCreate || !canUpdate) return;
    setDialog({
      kind: "prompt",
      title: t("files.newFile"),
      label: t("files.newFileNameLabel"),
      defaultValue: "new-file.txt",
      confirmLabel: t("common.create"),
      onYes: async (name) => {
        const trimmed = name?.trim();
        if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) {
          onError(t("files.invalidFileName"));
          return;
        }
        const path = joinPath(cwd === "." || !cwd ? "." : cwd, trimmed);
        setBusy(true);
        onError(null);
        try {
          await api.writeFile(serverId, path, "");
          await load(cwd);
          bumpTree();
          setTabs((prev) => {
            if (prev.some((tab) => tab.path === path)) return prev;
            return [...prev, { path, content: "", dirty: false }];
          });
          setActivePath(path);
          setPaneMode("editor");
        } catch (err) {
          onError(err instanceof Error ? err.message : t("files.createFileFailed"));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function onDelete(entry: FileEntry) {
    if (!canDelete) return;
    const body =
      entry.type === "dir"
        ? t("files.deleteBodyFolder", { name: entry.name })
        : t("files.deleteBodyFile", { name: entry.name });
    setDialog({
      kind: "confirm",
      title: t("files.deleteTitle"),
      body,
      confirmLabel: t("common.delete"),
      variant: "danger",
      onYes: async () => {
        setBusy(true);
        onError(null);
        try {
          setTabs((prev) => {
            const next = prev.filter(
              (tab) =>
                tab.path !== entry.path && !tab.path.startsWith(`${entry.path}/`),
            );
            if (
              activePath === entry.path ||
              activePath?.startsWith(`${entry.path}/`)
            ) {
              setActivePath(next[0]?.path ?? null);
              if (!next.length) setPaneMode("browser");
            }
            return next;
          });
          await api.deleteFile(serverId, entry.path);
          await load(cwd);
          bumpTree();
        } catch (err) {
          onError(err instanceof Error ? err.message : t("files.deleteFailed"));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function onRename(entry: FileEntry) {
    if (!canUpdate) return;
    setDialog({
      kind: "prompt",
      title: t("files.rename"),
      label: t("files.newNameLabel"),
      defaultValue: entry.name,
      confirmLabel: t("files.rename"),
      onYes: async (next) => {
        if (!next || next === entry.name) return;
        setBusy(true);
        onError(null);
        try {
          const destDir = parentPath(entry.path);
          const to = destDir === "." ? next : `${destDir}/${next}`;
          await api.renameFile(serverId, entry.path, to);
          setTabs((prev) =>
            prev.map((tab) => {
              if (tab.path === entry.path) return { ...tab, path: to };
              if (tab.path.startsWith(`${entry.path}/`)) {
                return {
                  ...tab,
                  path: `${to}${tab.path.slice(entry.path.length)}`,
                };
              }
              return tab;
            }),
          );
          if (activePath === entry.path) setActivePath(to);
          else if (activePath?.startsWith(`${entry.path}/`)) {
            setActivePath(`${to}${activePath.slice(entry.path.length)}`);
          }
          await load(cwd);
          bumpTree();
        } catch (err) {
          onError(err instanceof Error ? err.message : t("files.renameFailed"));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function onUpload(files: FileList | null) {
    if (!canUpload) return;
    if (!files?.length) return;
    const list = Array.from(files);
    setBusy(true);
    onError(null);
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        setUploadProgress(
          t("files.uploadProgress", {
            current: String(i + 1),
            total: String(list.length),
            name: file.name,
          }),
        );
        await api.uploadFile(serverId, cwd === "." ? "." : cwd, file);
      }
      await load(cwd);
      bumpTree();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.uploadFailed"));
    } finally {
      setBusy(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onDownload(entry: FileEntry) {
    if (!canDownload || entry.type !== "file") return;
    setBusy(true);
    onError(null);
    try {
      await api.downloadFile(serverId, entry.path, entry.name);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onDecompress(entry: FileEntry) {
    if (!canArchive || entry.type !== "file") return;
    setDialog({
      kind: "confirm",
      title: t("files.extractTitle"),
      body: t("files.extractBody", { name: entry.name }),
      confirmLabel: t("files.extractConfirm"),
      variant: "primary",
      onYes: async () => {
        setBusy(true);
        onError(null);
        try {
          await api.decompressFile(serverId, entry.path);
          await load(cwd);
          bumpTree();
        } catch (err) {
          onError(err instanceof Error ? err.message : t("files.extractFailed"));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function onCompressSelected() {
    if (!canArchive || !someSelected) return;
    const defaultName = `archive-${new Date().toISOString().slice(0, 10)}.zip`;
    setDialog({
      kind: "prompt",
      title: t("files.createArchiveTitle"),
      label: t("files.archiveNameLabel"),
      defaultValue: defaultName,
      confirmLabel: t("common.create"),
      onYes: async (name) => {
        if (!name?.trim()) return;
        const destination = joinPath(cwd === "." || !cwd ? "." : cwd, name.trim());
        setBusy(true);
        onError(null);
        try {
          await api.compressFiles(serverId, Array.from(selected), destination);
          await load(cwd);
          bumpTree();
        } catch (err) {
          onError(err instanceof Error ? err.message : t("files.compressFailed"));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function onDownloadSelectedArchive() {
    if (!canArchive || !canDownload || !someSelected) return;
    const stamp = Date.now();
    const destName = `download-${stamp}.zip`;
    setBusy(true);
    onError(null);
    try {
      try {
        await api.downloadZip(serverId, Array.from(selected), destName);
        return;
      } catch {
        // Fallback: persist zip on the node, then download + optional delete.
      }
      const destination = joinPath(cwd === "." || !cwd ? "." : cwd, destName);
      const result = await api.compressFiles(
        serverId,
        Array.from(selected),
        destination,
      );
      await api.downloadFile(serverId, result.path, destName);
      setDialog({
        kind: "confirm",
        title: t("files.deleteTempArchiveTitle"),
        body: t("files.deleteTempArchiveBody"),
        confirmLabel: t("common.delete"),
        variant: "warning",
        onYes: async () => {
          setBusy(true);
          onError(null);
          try {
            await api.deleteFile(serverId, result.path);
            await load(cwd);
            bumpTree();
          } catch (err) {
            onError(err instanceof Error ? err.message : t("files.deleteFailed"));
          } finally {
            setBusy(false);
          }
        },
      });
      await load(cwd);
      bumpTree();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.archiveDownloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onResizeStart(e: ReactMouseEvent) {
    e.preventDefault();
    resizingRef.current = true;
    document.body.classList.add("file-fm-resizing");
  }

  const showEditor = paneMode === "editor" && activeTab !== null;
  const treeVisibleDesktop = !treeCollapsed;
  const treeVisibleMobile = mobileTreeOpen;

  return (
    <div className="file-manager">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
        <h2 className="h5 mb-0">{t("files.title")}</h2>
        {anyDirty && (
          <span className="badge text-bg-warning">{t("files.unsavedTabs")}</span>
        )}
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
          style={
            treeVisibleDesktop
              ? { width: treeWidth, flexBasis: treeWidth }
              : undefined
          }
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
