import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { DiskUsageBreakdown, FileEntry } from "@msm/shared";
import {
  Button,
  Col,
  Form,
  InputGroup,
  Row,
  Spinner,
  Stack,
  Table,
} from "react-bootstrap";
import { api } from "../api";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { formatBytes } from "../utils";
import { DiskUsageCard } from "./DiskUsageCard";

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

function parentPath(path: string): string {
  if (!path) return ".";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : ".";
}

function isArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar")
  );
}

function joinPath(dir: string, name: string): string {
  return dir === "." || !dir ? name : `${dir}/${name}`;
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
  const [cwd, setCwd] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disk, setDisk] = useState<DiskUsageBreakdown | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (editing && editDirty && !confirm("Discard unsaved changes?")) return;
      setEditing(null);
      setEditDirty(false);
      await load(entry.path);
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
    if (editing && editDirty && !confirm("Discard unsaved changes?")) return;
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
  }

  async function goTo(path: string) {
    if (editing && editDirty && !confirm("Discard unsaved changes?")) return;
    setEditing(null);
    setEditDirty(false);
    await load(path);
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

  async function onDelete(entry: FileEntry) {
    if (!canDelete) return;
    const label = entry.type === "dir" ? `folder "${entry.name}" and its contents` : `"${entry.name}"`;
    if (!confirm(`Delete ${label}?`)) return;
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
  }

  async function onRename(entry: FileEntry) {
    if (!canUpdate) return;
    const next = prompt("New name", entry.name);
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

  async function onDecompress(entry: FileEntry) {
    if (!canArchive || entry.type !== "file") return;
    if (!confirm(`Extract "${entry.name}" into a new folder?`)) return;
    setBusy(true);
    onError(null);
    try {
      const result = await api.decompressFile(serverId, entry.path);
      await load(cwd);
      onError(null);
      void result;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCompressSelected() {
    if (!canArchive || !someSelected) return;
    const defaultName = `archive-${new Date().toISOString().slice(0, 10)}.zip`;
    const name = prompt("Archive file name (.zip or .tar.gz)", defaultName);
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
      if (confirm("Download started. Delete the temporary archive from the server?")) {
        await api.deleteFile(serverId, result.path);
      }
      await load(cwd);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Archive download failed");
    } finally {
      setBusy(false);
    }
  }

  const colSpan = 5;

  return (
    <div>
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
                  placeholder="New folder"
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
                Upload
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
          {loading ? (
            <div className="text-secondary py-3">
              <Spinner size="sm" className="me-2" />
              Loading…
            </div>
          ) : (
            <div className="table-responsive border rounded surface">
              <Table hover className="mb-0 align-middle">
                <thead>
                  <tr className="text-secondary">
                    <th style={{ width: "2.5rem" }}>
                      {(canDownload || canArchive) && (
                        <Form.Check
                          type="checkbox"
                          checked={allSelected}
                          disabled={!entries.length || busy}
                          onChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      )}
                    </th>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cwd !== "." && cwd !== "" && (
                    <tr>
                      <td colSpan={colSpan}>
                        <Button
                          variant="link"
                          className="p-0"
                          onClick={() => void goTo(parentPath(cwd))}
                          disabled={busy}
                        >
                          <i className="fa-solid fa-folder-open me-1" />
                          ..
                        </Button>
                      </td>
                    </tr>
                  )}
                  {entries.map((entry) => (
                    <tr key={entry.path} className={editing?.path === entry.path ? "table-active" : undefined}>
                      <td>
                        {(canDownload || canArchive) && (
                          <Form.Check
                            type="checkbox"
                            checked={selected.has(entry.path)}
                            disabled={busy}
                            onChange={() => toggleSelect(entry.path)}
                            aria-label={`Select ${entry.name}`}
                          />
                        )}
                      </td>
                      <td>
                        <Button
                          variant="link"
                          className="p-0 text-start"
                          onClick={() => void openEntry(entry)}
                          disabled={busy}
                        >
                          <i
                            className={`fa-solid ${entry.type === "dir" ? "fa-folder text-warning" : "fa-file text-secondary"} me-2`}
                          />
                          {entry.name}
                        </Button>
                      </td>
                      <td className="small text-secondary">
                        {entry.type === "dir" ? "—" : formatBytes(entry.size)}
                      </td>
                      <td className="small text-secondary">
                        {new Date(entry.modifiedAt).toLocaleString()}
                      </td>
                      <td className="text-end">
                        <Stack direction="horizontal" gap={1} className="justify-content-end flex-wrap">
                          {canDownload && entry.type === "file" && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              disabled={busy}
                              onClick={() => void onDownload(entry)}
                            >
                              Download
                            </Button>
                          )}
                          {canArchive && entry.type === "file" && isArchiveName(entry.name) && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              disabled={busy}
                              onClick={() => void onDecompress(entry)}
                            >
                              Unzip
                            </Button>
                          )}
                          {canUpdate && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              disabled={busy}
                              onClick={() => void onRename(entry)}
                            >
                              Rename
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={busy}
                              onClick={() => void onDelete(entry)}
                            >
                              Delete
                            </Button>
                          )}
                        </Stack>
                      </td>
                    </tr>
                  ))}
                  {!entries.length && (
                    <tr>
                      <td colSpan={colSpan} className="text-secondary">
                        This folder is empty.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </Col>

        {editing && (
          <Col lg={6}>
            <div className="border rounded surface p-3 h-100">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
                <strong className="font-monospace small text-break">{editing.path}</strong>
                <Stack direction="horizontal" gap={2}>
                  {editDirty && <span className="badge text-bg-warning">Unsaved</span>}
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (editDirty && !confirm("Discard unsaved changes?")) return;
                      setEditing(null);
                      setEditDirty(false);
                    }}
                  >
                    Close
                  </Button>
                  {canUpdate && (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy || !editDirty}
                      onClick={() => void saveFile()}
                    >
                      Save
                    </Button>
                  )}
                </Stack>
              </div>
              <Form.Control
                as="textarea"
                className="file-editor-textarea"
                value={editing.content}
                spellCheck={false}
                readOnly={!canUpdate}
                onChange={(e) => {
                  if (!canUpdate) return;
                  setEditing({ ...editing, content: e.target.value });
                  setEditDirty(true);
                }}
              />
            </div>
          </Col>
        )}
      </Row>
    </div>
  );
}
