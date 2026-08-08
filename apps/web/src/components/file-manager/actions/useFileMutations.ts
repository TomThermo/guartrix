import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import type { FileEntry } from "@msm/shared";
import { api } from "../../../api";
import { canViewFileContents, shouldDownloadInsteadOfEdit } from "../file-permissions";
import { joinPath, parentPath } from "../paths";
import type { Dialog, EditorTab } from "./types";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export function useFileMutations({
  serverId,
  onError,
  t,
  canReadContent,
  canUpdate,
  canCreate,
  canUpload,
  canDelete,
  canDownload,
  canArchive,
  cwd,
  someSelected,
  selected,
  newFolder,
  setNewFolder,
  setBusy,
  load,
  bumpTree,
  setUploadProgress,
  fileInputRef,
  setDialog,
  setTabs,
  activePath,
  setActivePath,
  setPaneMode,
  setMobileTreeOpen,
  openFileAtPath,
}: {
  serverId: string;
  onError: (message: string | null) => void;
  t: TFn;
  canReadContent: boolean;
  canUpdate: boolean;
  canCreate: boolean;
  canUpload: boolean;
  canDelete: boolean;
  canDownload: boolean;
  canArchive: boolean;
  cwd: string;
  someSelected: boolean;
  selected: Set<string>;
  newFolder: string;
  setNewFolder: (v: string) => void;
  setBusy: (busy: boolean) => void;
  load: (path: string) => Promise<void>;
  bumpTree: () => void;
  setUploadProgress: (v: string | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setDialog: (d: Dialog) => void;
  setTabs: Dispatch<SetStateAction<EditorTab[]>>;
  activePath: string | null;
  setActivePath: (path: string | null) => void;
  setPaneMode: (mode: "browser" | "editor") => void;
  setMobileTreeOpen: (open: boolean) => void;
  openFileAtPath: (path: string) => Promise<void>;
}) {
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
              (tab) => tab.path !== entry.path && !tab.path.startsWith(`${entry.path}/`),
            );
            if (activePath === entry.path || activePath?.startsWith(`${entry.path}/`)) {
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
      const result = await api.compressFiles(serverId, Array.from(selected), destination);
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

  return {
    openEntry,
    goTo,
    onMkdir,
    onNewFile,
    onDelete,
    onRename,
    onUpload,
    onDownload,
    onDecompress,
    onCompressSelected,
    onDownloadSelectedArchive,
  };
}
