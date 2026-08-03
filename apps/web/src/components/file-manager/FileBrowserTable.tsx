import type { FileEntry } from "@msm/shared";
import { Button, Form, Spinner, Stack, Table } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatBytes } from "../../utils";
import { isArchiveName, parentPath } from "./paths";

interface Props {
  cwd: string;
  entries: FileEntry[];
  loading: boolean;
  busy: boolean;
  editingPath: string | null;
  selected: Set<string>;
  allSelected: boolean;
  canDownload: boolean;
  canArchive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onGoTo: (path: string) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onToggleSelect: (path: string) => void;
  onToggleSelectAll: () => void;
  onDownload: (entry: FileEntry) => void;
  onDecompress: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

export function FileBrowserTable({
  cwd,
  entries,
  loading,
  busy,
  editingPath,
  selected,
  allSelected,
  canDownload,
  canArchive,
  canUpdate,
  canDelete,
  onGoTo,
  onOpenEntry,
  onToggleSelect,
  onToggleSelectAll,
  onDownload,
  onDecompress,
  onRename,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const colSpan = 5;

  if (loading) {
    return (
      <div className="text-secondary py-3">
        <Spinner size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
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
                  onChange={onToggleSelectAll}
                  aria-label="Select all"
                />
              )}
            </th>
            <th>{t("common.name")}</th>
            <th>{t("files.size")}</th>
            <th>{t("files.modified")}</th>
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
                  onClick={() => void onGoTo(parentPath(cwd))}
                  disabled={busy}
                >
                  <i className="fa-solid fa-folder-open me-1" />
                  ..
                </Button>
              </td>
            </tr>
          )}
          {entries.map((entry) => (
            <tr
              key={entry.path}
              className={editingPath === entry.path ? "table-active" : undefined}
            >
              <td>
                {(canDownload || canArchive) && (
                  <Form.Check
                    type="checkbox"
                    checked={selected.has(entry.path)}
                    disabled={busy}
                    onChange={() => onToggleSelect(entry.path)}
                    aria-label={`Select ${entry.name}`}
                  />
                )}
              </td>
              <td>
                <Button
                  variant="link"
                  className="p-0 text-start"
                  onClick={() => void onOpenEntry(entry)}
                  disabled={busy}
                >
                  <i
                    className={`fa-solid ${
                      entry.type === "dir"
                        ? "fa-folder text-warning"
                        : "fa-file text-secondary"
                    } me-2`}
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
                <Stack
                  direction="horizontal"
                  gap={1}
                  className="justify-content-end flex-wrap"
                >
                  {canDownload && entry.type === "file" && (
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={busy}
                      onClick={() => void onDownload(entry)}
                    >
                      {t("files.download")}
                    </Button>
                  )}
                  {canArchive &&
                    entry.type === "file" &&
                    isArchiveName(entry.name) && (
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
                      {t("files.rename")}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={busy}
                      onClick={() => void onDelete(entry)}
                    >
                      {t("files.delete")}
                    </Button>
                  )}
                </Stack>
              </td>
            </tr>
          ))}
          {!entries.length && (
            <tr>
              <td colSpan={colSpan} className="text-secondary">
                {t("files.empty")}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
