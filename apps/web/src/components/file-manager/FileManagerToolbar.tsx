import type { FormEvent, RefObject } from "react";
import { useState } from "react";
import { Button, Dropdown, Form, InputGroup, Modal } from "react-bootstrap";
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
  const [showMkdir, setShowMkdir] = useState(false);

  function submitMkdir(e: FormEvent) {
    onMkdir(e);
    if (newFolder.trim()) setShowMkdir(false);
  }

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
          <Dropdown>
            <Dropdown.Toggle
              size="sm"
              variant="outline-secondary"
              disabled={busy}
              id="files-new-menu"
            >
              <i className="fa-solid fa-plus me-1" aria-hidden />
              {t("files.newMenu")}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item
                as="button"
                onClick={() => {
                  onNewFolderChange("");
                  setShowMkdir(true);
                }}
              >
                <i className="fa-solid fa-folder-plus me-2 text-secondary" aria-hidden />
                {t("files.newFolder")}
              </Dropdown.Item>
              <Dropdown.Item as="button" onClick={onNewFile}>
                <i className="fa-solid fa-file me-2 text-secondary" aria-hidden />
                {t("files.newFile")}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        )}
        {canUpload && (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              title={t("files.uploadHint")}
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

      <Modal show={showMkdir} onHide={() => setShowMkdir(false)} centered>
        <Form onSubmit={submitMkdir}>
          <Modal.Header closeButton>
            <Modal.Title>{t("files.newFolder")}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <InputGroup>
              <Form.Control
                autoFocus
                placeholder={t("files.newFolder")}
                value={newFolder}
                onChange={(e) => onNewFolderChange(e.target.value)}
                disabled={busy}
              />
            </InputGroup>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowMkdir(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !newFolder.trim()}>
              {t("files.createFolder")}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
