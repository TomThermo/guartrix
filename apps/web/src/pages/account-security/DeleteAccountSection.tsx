import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Form } from "react-bootstrap";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";

type SectionProps = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export function DeleteAccountSection({ onNotice, onError }: SectionProps) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [exportBusy, setExportBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function onExportData() {
    setExportBusy(true);
    onError(null);
    try {
      await api.exportAccountData();
      onNotice("Account data download started.");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setExportBusy(false);
    }
  }

  async function onDeleteAccount() {
    if (deleteConfirm !== "DELETE") {
      onError("Type DELETE to confirm account deletion.");
      return;
    }
    if (!deletePassword) {
      onError(`${t("common.required")}: ${t("common.password")}`);
      return;
    }
    setDeleteBusy(true);
    onError(null);
    try {
      await api.deleteAccount(deletePassword);
      setShowDelete(false);
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <AdminPanelCard
        title={t("account.yourData")}
        icon="fa-file-export"
        className="account-danger-card"
      >
        <p className="small text-secondary mb-3">{t("account.yourDataHelp")}</p>
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="outline-primary"
            disabled={exportBusy}
            onClick={() => void onExportData()}
          >
            {exportBusy ? t("account.exportPreparing") : t("account.exportData")}
          </Button>
          <Button
            variant="outline-danger"
            disabled={exportBusy}
            onClick={() => {
              setDeletePassword("");
              setDeleteConfirm("");
              setShowDelete(true);
            }}
          >
            {t("account.deleteAccount")}
          </Button>
        </div>
      </AdminPanelCard>

      <DeleteAccountModal
        showDelete={showDelete}
        deleteBusy={deleteBusy}
        deletePassword={deletePassword}
        deleteConfirm={deleteConfirm}
        onDeletePasswordChange={setDeletePassword}
        onDeleteConfirmChange={setDeleteConfirm}
        onCancelDelete={() => setShowDelete(false)}
        onConfirmDelete={() => void onDeleteAccount()}
      />
    </>
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
