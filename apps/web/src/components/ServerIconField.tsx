import { useRef, useState } from "react";
import { Button, Form, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  serverId: string;
  hasIcon: boolean;
  onChanged: (hasIcon: boolean) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  /** When false, skip the outer border/padding (e.g. inside a modal). Default true. */
  bordered?: boolean;
}

async function fileTo64Png(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(bitmap, 0, 0, 64, 64);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode PNG");
  return blob;
}

export function ServerIconField({
  serverId,
  hasIcon,
  onChanged,
  onError,
  onNotice,
  bordered = true,
}: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(() => Date.now());
  const [autoResize, setAutoResize] = useState(true);

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    onError(null);
    onNotice?.(null);
    try {
      let upload: Blob | File = file;
      if (autoResize || !file.type.includes("png")) {
        upload = await fileTo64Png(file);
      }
      await api.uploadServerIcon(serverId, upload);
      setPreviewKey(Date.now());
      onChanged(true);
      onNotice?.(
        autoResize ? t("serverIcon.uploadedResized") : t("serverIcon.uploaded"),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("serverIcon.uploadFailed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemove() {
    if (!confirm(t("serverIcon.removeConfirm"))) return;
    setBusy(true);
    onError(null);
    onNotice?.(null);
    try {
      await api.deleteServerIcon(serverId);
      setPreviewKey(Date.now());
      onChanged(false);
      onNotice?.(t("serverIcon.removed"));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("serverIcon.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={bordered ? "border rounded p-3 bg-body-tertiary" : undefined}>
      <div className="d-flex gap-3 align-items-start flex-wrap">
        <img
          className="server-icon-preview"
          src={`/api/servers/${serverId}/icon?t=${hasIcon ? previewKey : "default"}`}
          alt={t("serverIcon.title")}
          width={64}
          height={64}
        />
        <div className="flex-grow-1">
          <div className="fw-semibold">{t("serverIcon.title")}</div>
          <p className="small text-secondary mb-2">
            {t("serverIcon.help")}
            {!hasIcon ? ` ${t("serverIcon.defaultUntilUpload")}` : ""}
          </p>
          <ul className="small text-secondary mb-2 ps-3">
            <li>
              {t("serverIcon.format")} <strong>PNG</strong>
            </li>
            <li>
              {t("serverIcon.size")} <strong>64×64</strong>
            </li>
            <li>{t("serverIcon.maxSize")}</li>
          </ul>
          <Form.Check
            type="checkbox"
            id={`auto-resize-icon-${serverId}`}
            label={t("serverIcon.autoResize")}
            checked={autoResize}
            onChange={(e) => setAutoResize(e.target.checked)}
            disabled={busy}
          />
        </div>
      </div>
      <Stack direction="horizontal" gap={2} className="mt-3">
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <i className="fa-solid fa-upload me-1" />
          {busy
            ? t("serverIcon.uploading")
            : hasIcon
              ? t("serverIcon.replace")
              : t("serverIcon.upload")}
        </Button>
        {hasIcon && (
          <Button
            size="sm"
            variant="outline-danger"
            disabled={busy}
            onClick={() => void onRemove()}
          >
            {t("serverIcon.remove")}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp"
          className="file-upload-input"
          onChange={(e) => void onPick(e.target.files)}
        />
      </Stack>
    </div>
  );
}
