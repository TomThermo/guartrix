import { useEffect, useRef } from "react";
import type { FileEntry } from "@msm/shared";
import { useI18n } from "../../i18n/react";
import {
  showDecompressButton,
  showDeleteButton,
  showDownloadButton,
  showRenameButton,
} from "./file-permissions";

export interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
}

interface Props {
  menu: ContextMenuState | null;
  canDownload: boolean;
  canArchive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onOpen: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onDecompress: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

export function FileContextMenu({
  menu,
  canDownload,
  canArchive,
  canUpdate,
  canDelete,
  busy,
  onClose,
  onOpen,
  onDownload,
  onDecompress,
  onRename,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const { entry, x, y } = menu;

  const items: { label: string; danger?: boolean; onClick: () => void }[] = [
    {
      label: entry.type === "dir" ? t("files.openFolder") : t("common.open"),
      onClick: () => onOpen(entry),
    },
  ];
  if (showDownloadButton({ canDownload }, entry)) {
    items.push({
      label: t("files.download"),
      onClick: () => onDownload(entry),
    });
  }
  if (showDecompressButton({ canArchive }, entry)) {
    items.push({
      label: t("files.unzip"),
      onClick: () => onDecompress(entry),
    });
  }
  if (showRenameButton({ canUpdate })) {
    items.push({
      label: t("files.rename"),
      onClick: () => onRename(entry),
    });
  }
  if (showDeleteButton({ canDelete })) {
    items.push({
      label: t("files.delete"),
      danger: true,
      onClick: () => onDelete(entry),
    });
  }

  const maxX = typeof window !== "undefined" ? window.innerWidth - 180 : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - items.length * 36 - 16 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return (
    <div ref={ref} className="file-context-menu" style={{ left, top }} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`file-context-item${item.danger ? " is-danger" : ""}`}
          disabled={busy}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
