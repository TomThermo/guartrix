import type { FormEvent, RefObject } from "react";
import { Button, Form, InputGroup } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { parentPath } from "./paths";

interface Props {
  cwd: string;
  crumbs: string[];
  busy: boolean;
  someSelected: boolean;
  newFolder: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  canCreate: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canArchive: boolean;
  treeCollapsed: boolean;
  onToggleTree: () => void;
  onGoTo: (path: string) => void;
  onRefresh: () => void;
  onNewFolderChange: (value: string) => void;
  onMkdir: (e: FormEvent) => void;
  onNewFile: () => void;
  onUpload: (files: FileList | null) => void;
  onCompressSelected: () => void;
  onDownloadSelectedArchive: () => void;
}

export function FileManagerToolbar({
  cwd,
  crumbs,
  busy,
  someSelected,
  newFolder,
  fileInputRef,
  canCreate,
  canUpload,
  canDownload,
  canArchive,
  treeCollapsed,
  onToggleTree,
  onGoTo,
  onRefresh,
  onNewFolderChange,
  onMkdir,
  onNewFile,
  onUpload,
  onCompressSelected,
  onDownloadSelectedArchive,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="file-toolbar border rounded p-2">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={busy}
          title={treeCollapsed ? t("files.showTree") : t("files.hideTree")}
          onClick={onToggleTree}
        >
          <i className="fa-solid fa-layer-group" />
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={busy || cwd === "." || !cwd}
          title={t("files.upFolder")}
          onClick={() => onGoTo(parentPath(cwd))}
        >
          <i className="fa-solid fa-arrow-up" />
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={busy}
          title={t("files.root")}
          onClick={() => onGoTo(".")}
        >
          <i className="fa-solid fa-house" />
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={busy}
          title={t("common.refresh")}
          onClick={onRefresh}
        >
          <i className="fa-solid fa-arrows-rotate" />
        </Button>

        <div className="file-path flex-grow-1 min-w-0">
          <button
            type="button"
            className="file-path-seg"
            disabled={busy}
            onClick={() => onGoTo(".")}
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
                    onClick={() => onGoTo(path)}
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
              title={t("files.zipSelected")}
              onClick={() => onCompressSelected()}
            >
              <i className="fa-solid fa-file-zipper me-1" />
              {t("files.zip")}
            </Button>
            {canDownload && (
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={busy}
                title={t("files.downloadZipSelected")}
                onClick={() => onDownloadSelectedArchive()}
              >
                <i className="fa-solid fa-download me-1" />
                {t("files.downloadZip")}
              </Button>
            )}
          </>
        )}

        {canCreate && (
          <>
            <Form onSubmit={onMkdir} className="file-mkdir">
              <InputGroup size="sm">
                <Form.Control
                  placeholder={t("files.newFolder")}
                  value={newFolder}
                  onChange={(e) => onNewFolderChange(e.target.value)}
                  disabled={busy}
                />
                <Button
                  type="submit"
                  variant="outline-secondary"
                  disabled={busy || !newFolder.trim()}
                  title={t("files.newFolder")}
                >
                  <i className="fa-solid fa-folder-plus" />
                </Button>
              </InputGroup>
            </Form>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={busy}
              title={t("files.newFile")}
              onClick={onNewFile}
            >
              <i className="fa-solid fa-file me-1" />
              {t("files.newFile")}
            </Button>
          </>
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
              multiple
              className="file-upload-input"
              onChange={(e) => onUpload(e.target.files)}
            />
          </>
        )}
      </div>
      <p className="file-toolbar-hint small text-secondary mb-0 mt-2">
        {t("files.uploadHint")}
      </p>
    </div>
  );
}
