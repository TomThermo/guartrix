import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { FileEntry } from "@msm/shared";
import { api } from "../../../api";
import { useI18n } from "../../../i18n/react";
import type { ContextMenuState } from "../FileContextMenu";
import { useFileDiskPoll } from "../useFileDiskPoll";
import { readStoredCollapsed, readStoredWidth } from "./storage";
import { MAX_TREE_WIDTH, MIN_TREE_WIDTH, TREE_COLLAPSED_KEY, TREE_WIDTH_KEY } from "./types";

export function useFileBrowserState({
  serverId,
  onError,
  active = true,
}: {
  serverId: string;
  onError: (message: string | null) => void;
  active?: boolean;
}) {
  const { t } = useI18n();
  const [cwd, setCwd] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizingRef = useRef(false);
  const treeWidthRef = useRef(treeWidth);
  treeWidthRef.current = treeWidth;

  function bumpTree() {
    setTreeRefreshKey((k) => k + 1);
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
      const next = Math.min(MAX_TREE_WIDTH, Math.max(MIN_TREE_WIDTH, e.clientX - 24));
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
    /* Overlay drawer only on tall phones; Fold (near-square) uses inline tree. */
    const phonePortrait =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 575.98px) and (max-aspect-ratio: 3/4)").matches;
    if (phonePortrait) {
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

  function onResizeStart(e: ReactMouseEvent) {
    e.preventDefault();
    resizingRef.current = true;
    document.body.classList.add("file-fm-resizing");
  }

  const treeVisibleDesktop = !treeCollapsed;
  const treeVisibleMobile = mobileTreeOpen;

  return {
    t,
    cwd,
    entries,
    loading,
    busy,
    setBusy,
    newFolder,
    setNewFolder,
    selected,
    filter,
    setFilter,
    uploadProgress,
    setUploadProgress,
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
    fileInputRef,
    crumbs,
    allSelected,
    someSelected,
    treeVisibleDesktop,
    treeVisibleMobile,
    load,
    bumpTree,
    toggleSelect,
    toggleSelectAll,
    toggleTree,
    onResizeStart,
  };
}
