import { useMemo, useState, type DragEvent } from "react";
import type { FileEntry } from "@guartrix/shared";
import { Button, Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatBytes } from "../../utils";
import { EmptyState } from "../EmptyState";
import { TabLoading } from "../TabLoading";
import { parentPath } from "./paths";
import {
  showBulkSelect,
  showDecompressButton,
  showDeleteButton,
  showDownloadButton,
  showRenameButton,
} from "./file-permissions";
import type { ContextMenuState } from "./FileContextMenu";

interface Props {
  cwd: string;
  entries: FileEntry[];
  loading: boolean;
  busy: boolean;
  activeFilePath: string | null;
  selected: Set<string>;
  allSelected: boolean;
  canDownload: boolean;
  canArchive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canUpload: boolean;
  filter: string;
  uploadProgress: string | null;
  dragActive: boolean;
  onFilterChange: (value: string) => void;
  onGoTo: (path: string) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onToggleSelect: (path: string) => void;
  onToggleSelectAll: () => void;
  onDownload: (entry: FileEntry) => void;
  onDecompress: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onContextMenu: (menu: ContextMenuState) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDropFiles: (files: FileList) => void;
}

function entryIcon(entry: FileEntry): string {
  if (entry.type === "dir") return "fa-folder text-warning";
  const n = entry.name.toLowerCase();
  if (n.endsWith(".jar")) return "fa-cube text-secondary";
  if (
    n.endsWith(".yml") ||
    n.endsWith(".yaml") ||
    n.endsWith(".json") ||
    n.endsWith(".properties")
  ) {
    return "fa-file-code text-secondary";
  }
  if (n.endsWith(".log") || n.endsWith(".txt")) return "fa-scroll text-secondary";
  if (n.endsWith(".zip") || n.endsWith(".tar.gz") || n.endsWith(".tgz") || n.endsWith(".tar")) {
    return "fa-file-zipper text-secondary";
  }
  return "fa-file text-secondary";
}

export function FileBrowserTable({
  cwd,
  entries,
  loading,
  busy,
  activeFilePath,
  selected,
  allSelected,
  canDownload,
  canArchive,
  canUpdate,
  canDelete,
  canUpload,
  filter,
  uploadProgress,
  dragActive,
  onFilterChange,
  onGoTo,
  onOpenEntry,
  onToggleSelect,
  onToggleSelectAll,
  onDownload,
  onDecompress,
  onRename,
  onDelete,
  onContextMenu,
  onDragEnter,
  onDragLeave,
  onDropFiles,
}: Props) {
  const { t } = useI18n();
  const [dragDepth, setDragDepth] = useState(0);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, filter]);

  function handleDragEnter(e: DragEvent) {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => d + 1);
    onDragEnter();
  }

  function handleDragLeave(e: DragEvent) {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => {
      const next = Math.max(0, d - 1);
      if (next === 0) onDragLeave();
      return next;
    });
  }

  function handleDragOver(e: DragEvent) {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent) {
    if (!canUpload) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    onDragLeave();
    if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`file-browser border rounded surface${dragActive || dragDepth > 0 ? " is-dragover" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {(dragActive || dragDepth > 0) && canUpload && (
        <div className="file-drop-overlay">
          <i className="fa-solid fa-cloud-arrow-up fa-2x mb-2" />
          <div>{t("files.dropToUpload")}</div>
        </div>
      )}

      <div className="file-browser-toolbar">
        <div className="file-browser-filter">
          <i className="fa-solid fa-magnifying-glass" />
          <Form.Control
            size="sm"
            type="search"
            placeholder={t("files.filterPlaceholder")}
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            disabled={loading}
          />
        </div>
        {uploadProgress && (
          <span className="small text-secondary file-upload-progress">{uploadProgress}</span>
        )}
      </div>

      {loading ? (
        <TabLoading py="sm" />
      ) : (
        <div className="file-browser-list">
          <div className="file-browser-header">
            <div className="file-browser-col-check">
              {showBulkSelect({ canDownload, canArchive }) && (
                <Form.Check
                  type="checkbox"
                  checked={allSelected}
                  disabled={!entries.length || busy}
                  onChange={onToggleSelectAll}
                  aria-label={t("files.selectAll")}
                />
              )}
            </div>
            <div className="file-browser-col-name">{t("common.name")}</div>
            <div className="file-browser-col-size">{t("files.size")}</div>
            <div className="file-browser-col-modified">{t("files.modified")}</div>
            <div className="file-browser-col-actions" />
          </div>

          {cwd !== "." && cwd !== "" && (
            <button
              type="button"
              className="file-browser-row file-browser-up"
              disabled={busy}
              onClick={() => void onGoTo(parentPath(cwd))}
            >
              <div className="file-browser-col-check" />
              <div className="file-browser-col-name">
                <i className="fa-solid fa-folder-open me-2 text-warning" />
                ..
              </div>
              <div className="file-browser-col-size" />
              <div className="file-browser-col-modified" />
              <div className="file-browser-col-actions" />
            </button>
          )}

          {filtered.map((entry) => (
            <div
              key={entry.path}
              className={`file-browser-row${
                activeFilePath === entry.path ? " is-active" : ""
              }${selected.has(entry.path) ? " is-selected" : ""}`}
              onDoubleClick={() => void onOpenEntry(entry)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu({ x: e.clientX, y: e.clientY, entry });
              }}
            >
              <div className="file-browser-col-check">
                {showBulkSelect({ canDownload, canArchive }) && (
                  <Form.Check
                    type="checkbox"
                    checked={selected.has(entry.path)}
                    disabled={busy}
                    onChange={() => onToggleSelect(entry.path)}
                    aria-label={t("files.selectItem", { name: entry.name })}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
              <button
                type="button"
                className="file-browser-col-name file-browser-name-btn"
                disabled={busy}
                onClick={() => void onOpenEntry(entry)}
              >
                <i className={`fa-solid ${entryIcon(entry)} me-2`} />
                <span className="text-truncate">{entry.name}</span>
              </button>
              <div className="file-browser-col-size small text-secondary">
                {entry.type === "dir" ? "—" : formatBytes(entry.size)}
              </div>
              <div className="file-browser-col-modified small text-secondary">
                {new Date(entry.modifiedAt).toLocaleString()}
              </div>
              <div className="file-browser-col-actions">
                {showDownloadButton({ canDownload }, entry) && (
                  <Button
                    size="sm"
                    variant="link"
                    className="p-1"
                    disabled={busy}
                    title={t("files.download")}
                    onClick={() => void onDownload(entry)}
                  >
                    <i className="fa-solid fa-download" />
                  </Button>
                )}
                {showDecompressButton({ canArchive }, entry) && (
                  <Button
                    size="sm"
                    variant="link"
                    className="p-1"
                    disabled={busy}
                    title={t("files.unzip")}
                    onClick={() => void onDecompress(entry)}
                  >
                    <i className="fa-solid fa-box-open" />
                  </Button>
                )}
                {showRenameButton({ canUpdate }) && (
                  <Button
                    size="sm"
                    variant="link"
                    className="p-1"
                    disabled={busy}
                    title={t("files.rename")}
                    onClick={() => void onRename(entry)}
                  >
                    <i className="fa-solid fa-pen" />
                  </Button>
                )}
                {showDeleteButton({ canDelete }) && (
                  <Button
                    size="sm"
                    variant="link"
                    className="p-1 text-danger"
                    disabled={busy}
                    title={t("files.delete")}
                    onClick={() => void onDelete(entry)}
                  >
                    <i className="fa-solid fa-trash" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {!filtered.length && (
            <EmptyState message={filter.trim() ? t("files.filterEmpty") : t("files.empty")} />
          )}
        </div>
      )}
    </div>
  );
}
