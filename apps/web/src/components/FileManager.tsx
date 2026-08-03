import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { DiskUsageBreakdown, FileEntry } from "@msm/shared";
import {
  Button,
  Col,
  Form,
  InputGroup,
  Row,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { ConfirmModal } from "./ConfirmModal";
import { DiskUsageCard } from "./DiskUsageCard";
import { FileBrowserTable } from "./file-manager/FileBrowserTable";
import { FileEditorPane } from "./file-manager/FileEditorPane";
import { joinPath, parentPath } from "./file-manager/paths";
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

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
  /** Disk quota in MB (for free-remaining display). */
  diskMb?: number;
  /** When false, skip disk usage polling (inactive tab). */
  active?: boolean;
  canReadContent?: boolean;
  canUpdate?: boolean;
  canCreate?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  canDownload?: boolean;
  canArchive?: boolean;
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
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disk, setDisk] = useState<DiskUsageBreakdown | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadDisk = useCallback(async () => {
    try {
      const next = await api.getDiskUsage(serverId);
      setDisk(next);
    } catch {
      // non-fatal — file list still works
    }
  }, [serverId]);

  useVisibleInterval(() => void loadDisk(), 30_000, active);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      onError(null);
      try {
        const data = await api.listFiles(serverId, path);
        setCwd(data.path || ".");
        setEntries(data.entries);
        setSelected(new Set());
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to list files");
      } finally {
        setLoading(false);
      }
    },
    [serverId, onError],
  );

  useEffect(() => {
    void load(".");
  }, [load]);

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

  async function openEntry(entry: FileEntry) {
    if (entry.type === "dir") {
      const proceed = async () => {
        setEditing(null);
        setEditDirty(false);
        await load(entry.path);
      };
      if (editing && editDirty) {
        askDiscard(proceed);
        return;
      }
      await proceed();
      return;
    }
    if (!entry.editable) {
      if (canDownload) {
        await onDownload(entry);
        return;
      }
      onError("This file cannot be edited in the panel (binary or too large).");
      return;
    }
    if (!canReadContent) {
      onError("You do not have permission to view file contents.");
      return;
    }
    const openFile = async () => {
      setBusy(true);
      onError(null);
      try {
        const data = await api.readFile(serverId, entry.path);
        setEditing({ path: data.path, content: data.content });
        setEditDirty(false);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to open file");
      } finally {
        setBusy(false);
      }
    };
    if (editing && editDirty) {
      askDiscard(openFile);
      return;
    }
    await openFile();
  }

  async function goTo(path: string) {
    const proceed = async () => {
      setEditing(null);
      setEditDirty(false);
      await load(path);
    };
    if (editing && editDirty) {
      askDiscard(proceed);
      return;
    }
    await proceed();
  }

  async function saveFile() {
    if (!editing || !canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      await api.writeFile(serverId, editing.path, editing.content);
      setEditDirty(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
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
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(entry: FileEntry) {
    if (!canDelete) return;
    const label = entry.type === "dir" ? `folder "${entry.name}" and its contents` : `"${entry.name}"`;
    setDialog({
      kind: "confirm",
      title: "Delete?",
      body: `Delete ${label}?`,
      confirmLabel: t("common.delete"),
      variant: "danger",
      onYes: async () => {
        setBusy(true);
        onError(null);
        try {
          if (editing?.path === entry.path || editing?.path.startsWith(`${entry.path}/`)) {
            setEditing(null);
            setEditDirty(false);
          }
          await api.deleteFile(serverId, entry.path);
          await load(cwd);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Delete failed");
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
      label: "New name",
      defaultValue: entry.name,
      confirmLabel: "Rename",
      onYes: async (next) => {
        if (!next || next === entry.name) return;
        setBusy(true);
        onError(null);
        try {
          const destDir = parentPath(entry.path);
          const to = destDir === "." ? next : `${destDir}/${next}`;
          await api.renameFile(serverId, entry.path, to);
          if (editing?.path === entry.path) {
            setEditing((prev) => (prev ? { ...prev, path: to } : prev));
          }
          await load(cwd);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Rename failed");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function onUpload(files: FileList | null) {
    if (!canUpload) return;
    if (!files?.length) return;
    setBusy(true);
    onError(null);
    try {
      for (const file of Array.from(files)) {
        await api.uploadFile(serverId, cwd === "." ? "." : cwd, file);
      }
      await load(cwd);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
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
      onError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  function onDecompress(entry: FileEntry) {
    if (!canArchive || entry.type !== "file") return;
    setDialog({
      kind: "confirm",
      title: "Extract archive?",
      body: `Extract "${entry.name}" into a new folder?`,
      confirmLabel: "Extract",
      variant: "primary",
      onYes: async () => {
        setBusy(true);
        onError(null);
        try {
          await api.decompressFile(serverId, entry.path);
          await load(cwd);
          onError(null);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Extract failed");
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
      title: "Create archive",
      label: "Archive file name (.zip or .tar.gz)",
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
        } catch (err) {
          onError(err instanceof Error ? err.message : "Compress failed");
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
        title: "Delete temporary archive?",
        body: "Download started. Delete the temporary archive from the server?",
        confirmLabel: t("common.delete"),
        variant: "warning",
        onYes: async () => {
          setBusy(true);
          onError(null);
          try {
            await api.deleteFile(serverId, result.path);
            await load(cwd);
          } catch (err) {
            onError(err instanceof Error ? err.message : "Delete failed");
          } finally {
            setBusy(false);
          }
        },
      });
      await load(cwd);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Archive download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="h5 mb-3">{t("files.title")}</h2>
      {disk && (
        <DiskUsageCard disk={disk} limitMb={diskMb} compact />
      )}
      <div className="file-toolbar border rounded bg-body-tertiary p-2 mb-3">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={busy || cwd === "." || !cwd}
            title="Up one folder"
            onClick={() => void goTo(parentPath(cwd))}
          >
            <i className="fa-solid fa-arrow-up" />
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={busy}
            title="Root"
            onClick={() => void goTo(".")}
          >
            <i className="fa-solid fa-house" />
          </Button>

          <div className="file-path flex-grow-1 min-w-0">
            <button
              type="button"
              className="file-path-seg"
              disabled={busy}
              onClick={() => void goTo(".")}
            >
              /
            </button>
            {crumbs.map((part, i) => {
              const path = crumbs.slice(0, i + 1).join("/");
              const last = i === crumbs.length - 1;
              return (
                <span key={path} className="file-path-wrap">
                  <span className="file-path-sep text-secondary">/</span>
                  {last ? (
                    <span className="file-path-current">{part}</span>
                  ) : (
                    <button
                      type="button"
                      className="file-path-seg"
                      disabled={busy}
                      onClick={() => void goTo(path)}
                    >
                      {part}
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {canArchive && someSelected && (
            <>
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={busy}
                title="Zip selected into this folder"
                onClick={() => void onCompressSelected()}
              >
                <i className="fa-solid fa-file-zipper me-1" />
                Zip
              </Button>
              {canDownload && (
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={busy}
                  title="Zip and download selected"
                  onClick={() => void onDownloadSelectedArchive()}
                >
                  <i className="fa-solid fa-download me-1" />
                  Download zip
                </Button>
              )}
            </>
          )}

          {canCreate && (
            <Form onSubmit={(e) => void onMkdir(e)} className="file-mkdir">
              <InputGroup size="sm">
                <Form.Control
                  placeholder={t("files.newFolder")}
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  disabled={busy}
                />
                <Button type="submit" variant="outline-secondary" disabled={busy || !newFolder.trim()}>
                  <i className="fa-solid fa-folder-plus" />
                </Button>
              </InputGroup>
            </Form>
          )}
          {canUpload && (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <i className="fa-solid fa-upload me-1" />
                {t("files.upload")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="file-upload-input"
                onChange={(e) => void onUpload(e.target.files)}
              />
            </>
          )}
        </div>
      </div>

      <Row className="g-3">
        <Col lg={editing ? 6 : 12}>
          <FileBrowserTable
            cwd={cwd}
            entries={entries}
            loading={loading}
            busy={busy}
            editingPath={editing?.path ?? null}
            selected={selected}
            allSelected={allSelected}
            canDownload={canDownload}
            canArchive={canArchive}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onGoTo={goTo}
            onOpenEntry={openEntry}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onDownload={onDownload}
            onDecompress={onDecompress}
            onRename={onRename}
            onDelete={onDelete}
          />
        </Col>

        {editing && (
          <Col lg={6}>
            <FileEditorPane
              path={editing.path}
              content={editing.content}
              dirty={editDirty}
              busy={busy}
              canUpdate={canUpdate}
              onChange={(content) => {
                setEditing({ ...editing, content });
                setEditDirty(true);
              }}
              onClose={() => {
                setEditing(null);
                setEditDirty(false);
              }}
              onSave={() => void saveFile()}
              onAskDiscard={askDiscard}
            />
          </Col>
        )}
      </Row>

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
