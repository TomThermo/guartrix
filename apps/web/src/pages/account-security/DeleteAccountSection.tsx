import { Button, Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";

interface SectionProps {
  busy: boolean;
  exportBusy: boolean;
  onExportData: () => void;
  onOpenDelete: () => void;
}

export function DeleteAccountSection({
  busy,
  exportBusy,
  onExportData,
  onOpenDelete,
}: SectionProps) {
  const { t } = useI18n();

  return (
    <AdminPanelCard
      title={t("account.yourData")}
      icon="fa-file-export"
      className="account-danger-card"
    >
      <p className="small text-secondary mb-3">{t("account.yourDataHelp")}</p>
      <div className="d-flex flex-wrap gap-2">
        <Button
          variant="outline-primary"
          disabled={busy || exportBusy}
          onClick={() => void onExportData()}
        >
          {exportBusy ? t("account.exportPreparing") : t("account.exportData")}
        </Button>
        <Button variant="outline-danger" disabled={busy} onClick={onOpenDelete}>
          {t("account.deleteAccount")}
        </Button>
      </div>
    </AdminPanelCard>
  );
}

interface ModalProps {
  showDelete: boolean;
  deleteBusy: boolean;
  deletePassword: string;
  deleteConfirm: string;
  onDeletePasswordChange: (value: string) => void;
  onDeleteConfirmChange: (value: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

/** Delete-confirm dialog — keep as sibling of AdminPageShell (same as before the split). */
export function DeleteAccountModal({
  showDelete,
  deleteBusy,
  deletePassword,
  deleteConfirm,
  onDeletePasswordChange,
  onDeleteConfirmChange,
  onCancelDelete,
  onConfirmDelete,
}: ModalProps) {
  const { t } = useI18n();

  return (
    <ConfirmModal
      show={showDelete}
      title={t("account.deleteAccountTitle")}
      variant="danger"
      confirmLabel={t("account.deleteAccount")}
      busy={deleteBusy}
      onCancel={() => {
        if (!deleteBusy) onCancelDelete();
      }}
      onConfirm={() => void onConfirmDelete()}
      body={
        <div>
          <p className="mb-3">{t("account.deleteAccountBody")}</p>
          <Form.Group className="mb-3" controlId="delete-confirm">
            <Form.Label>{t("account.deleteConfirmation")}</Form.Label>
            <Form.Control
              value={deleteConfirm}
              onChange={(e) => onDeleteConfirmChange(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={deleteBusy}
            />
          </Form.Group>
          <Form.Group controlId="delete-password">
            <Form.Label>{t("common.password")}</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => onDeletePasswordChange(e.target.value)}
              disabled={deleteBusy}
            />
          </Form.Group>
        </div>
      }
    />
  );
}
