import type { FileEntry } from "@msm/shared";
import { isArchiveName } from "./paths";

export interface FileActionPermissions {
  canDownload: boolean;
  canArchive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canReadContent?: boolean;
}

/** Bulk row checkboxes when download or archive is allowed. */
export function showBulkSelect(
  perms: Pick<FileActionPermissions, "canDownload" | "canArchive">,
): boolean {
  return perms.canDownload || perms.canArchive;
}

export function showDownloadButton(
  perms: Pick<FileActionPermissions, "canDownload">,
  entry: Pick<FileEntry, "type">,
): boolean {
  return perms.canDownload && entry.type === "file";
}

export function showDecompressButton(
  perms: Pick<FileActionPermissions, "canArchive">,
  entry: Pick<FileEntry, "type" | "name">,
): boolean {
  return perms.canArchive && entry.type === "file" && isArchiveName(entry.name);
}

export function showRenameButton(perms: Pick<FileActionPermissions, "canUpdate">): boolean {
  return perms.canUpdate;
}

export function showDeleteButton(perms: Pick<FileActionPermissions, "canDelete">): boolean {
  return perms.canDelete;
}

/** Non-editable files fall back to download when allowed. */
export function shouldDownloadInsteadOfEdit(
  entry: Pick<FileEntry, "editable">,
  perms: Pick<FileActionPermissions, "canDownload">,
): boolean {
  return !entry.editable && perms.canDownload;
}

export function canViewFileContents(perms: Pick<FileActionPermissions, "canReadContent">): boolean {
  return perms.canReadContent !== false;
}
