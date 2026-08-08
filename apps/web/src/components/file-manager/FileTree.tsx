import { useCallback, useEffect, useState } from "react";
import type { FileEntry } from "@msm/shared";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";

interface Props {
  serverId: string;
  cwd: string;
  activeFilePath: string | null;
  busy: boolean;
  refreshKey: number;
  onNavigate: (path: string) => void;
  onOpenFile: (entry: FileEntry) => void;
}

type ChildrenMap = Record<string, FileEntry[] | "loading" | "error">;

function ancestorsOf(path: string): string[] {
  if (!path || path === ".") return ["."];
  const parts = path.split("/").filter(Boolean);
  const out = ["."];
  for (let i = 0; i < parts.length; i++) {
    out.push(parts.slice(0, i + 1).join("/"));
  }
  return out;
}

function TreeNode({
  entry,
  depth,
  cwd,
  activeFilePath,
  expanded,
  childrenMap,
  busy,
  onToggle,
  onNavigate,
  onOpenFile,
}: {
  entry: FileEntry;
  depth: number;
  cwd: string;
  activeFilePath: string | null;
  expanded: Set<string>;
  childrenMap: ChildrenMap;
  busy: boolean;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  onOpenFile: (entry: FileEntry) => void;
}) {
  const isDir = entry.type === "dir";
  const isOpen = expanded.has(entry.path);
  const isCwd = isDir && (cwd === entry.path || (cwd === "." && entry.path === "."));
  const isActiveFile = !isDir && activeFilePath === entry.path;
  const kids = childrenMap[entry.path];

  return (
    <div className="file-tree-node">
      <button
        type="button"
        className={`file-tree-row${isCwd || isActiveFile ? " is-active" : ""}`}
        style={{ paddingLeft: `${0.35 + depth * 0.75}rem` }}
        disabled={busy}
        onClick={() => {
          if (isDir) {
            if (!isOpen) onToggle(entry.path);
            onNavigate(entry.path);
            return;
          }
          onOpenFile(entry);
        }}
      >
        {isDir ? (
          <span
            className="file-tree-twistie"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(entry.path);
            }}
            role="presentation"
          >
            <i className={`fa-solid ${isOpen ? "fa-chevron-down" : "fa-chevron-right"}`} />
          </span>
        ) : (
          <span className="file-tree-twistie-spacer" />
        )}
        <i
          className={`fa-solid ${
            isDir
              ? isOpen
                ? "fa-folder-open text-warning"
                : "fa-folder text-warning"
              : "fa-file text-secondary"
          } file-tree-icon`}
        />
        <span className="file-tree-label text-truncate">{entry.name}</span>
      </button>
      {isDir && isOpen && (
        <div className="file-tree-children">
          {kids === "loading" && (
            <div
              className="file-tree-muted"
              style={{ paddingLeft: `${0.35 + (depth + 1) * 0.75}rem` }}
            >
              …
            </div>
          )}
          {kids === "error" && (
            <div
              className="file-tree-muted text-danger"
              style={{ paddingLeft: `${0.35 + (depth + 1) * 0.75}rem` }}
            >
              !
            </div>
          )}
          {Array.isArray(kids) &&
            kids.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                cwd={cwd}
                activeFilePath={activeFilePath}
                expanded={expanded}
                childrenMap={childrenMap}
                busy={busy}
                onToggle={onToggle}
                onNavigate={onNavigate}
                onOpenFile={onOpenFile}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  serverId,
  cwd,
  activeFilePath,
  busy,
  refreshKey,
  onNavigate,
  onOpenFile,
}: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["."]));
  const [childrenMap, setChildrenMap] = useState<ChildrenMap>({});

  const loadChildren = useCallback(
    async (path: string) => {
      setChildrenMap((prev) => ({ ...prev, [path]: "loading" }));
      try {
        const data = await api.listFiles(serverId, path);
        const dirsFirst = [...data.entries].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setChildrenMap((prev) => ({ ...prev, [path]: dirsFirst }));
      } catch {
        setChildrenMap((prev) => ({ ...prev, [path]: "error" }));
      }
    },
    [serverId],
  );

  useEffect(() => {
    void loadChildren(".");
  }, [loadChildren, refreshKey]);

  useEffect(() => {
    const target = activeFilePath ? ancestorsOf(activeFilePath) : ancestorsOf(cwd);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const p of target) next.add(p);
      return next;
    });
    for (const p of target) {
      void loadChildren(p);
    }
  }, [cwd, activeFilePath, loadChildren]);

  function onToggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        void loadChildren(path);
      }
      return next;
    });
  }

  const rootKids = childrenMap["."];

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="small text-secondary text-uppercase fw-semibold">
          {t("files.explorer")}
        </span>
      </div>
      <div className="file-tree-body">
        <button
          type="button"
          className={`file-tree-row${cwd === "." || !cwd ? " is-active" : ""}`}
          style={{ paddingLeft: "0.35rem" }}
          disabled={busy}
          onClick={() => onNavigate(".")}
        >
          <span className="file-tree-twistie-spacer" />
          <i className="fa-solid fa-hard-drive file-tree-icon text-secondary" />
          <span className="file-tree-label">{t("files.root")}</span>
        </button>
        {rootKids === "loading" && (
          <div className="file-tree-muted" style={{ paddingLeft: "1.1rem" }}>
            {t("common.loading")}…
          </div>
        )}
        {Array.isArray(rootKids) &&
          rootKids.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={1}
              cwd={cwd}
              activeFilePath={activeFilePath}
              expanded={expanded}
              childrenMap={childrenMap}
              busy={busy}
              onToggle={onToggle}
              onNavigate={onNavigate}
              onOpenFile={onOpenFile}
            />
          ))}
      </div>
    </div>
  );
}
