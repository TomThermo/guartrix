import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type { ApplicationApiKeyRecord } from "@msm/shared";
import { Alert } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AdminPageShell } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";
import { ApplicationApiKeysCard } from "./admin-billing/AppKeysPaymentsPanel";

export function AdminApiKeysPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApplicationApiKeyRecord[]>([]);
  const [maxKeys, setMaxKeys] = useState(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["*"]);
  const [newToken, setNewToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const k = await api.listApplicationKeys();
    setKeys(k.keys);
    setMaxKeys(k.maxKeys);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("common.requestFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  async function onCreateKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNewToken(null);
    try {
      const result = await api.createApplicationKey({
        name: keyName.trim(),
        scopes: keyScopes,
      });
      setNewToken(result.token);
      setKeyName("");
      setNotice(t("admin.appKeyCreatedNotice"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(key: ApplicationApiKeyRecord) {
    if (!confirm(t("admin.appApiKeysRevokeConfirm", { name: key.name }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeApplicationKey(key.id);
      setNotice(t("admin.appApiKeysRevokedNotice"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageShell
      title={t("admin.appApiKeysPageTitle")}
      subtitle={t("admin.appApiKeysPageSubtitle")}
      icon="fa-key"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      warning={
        newToken ? (
          <Alert variant="warning">
            <strong>{t("admin.copyAppTokenNow")}</strong>
            <code className="d-block mt-2 user-select-all text-break">{newToken}</code>
          </Alert>
        ) : null
      }
      loading={loading}
      loadingLabel={`${t("common.loading")}…`}
    >
      <ApplicationApiKeysCard
        keys={keys}
        maxKeys={maxKeys}
        keyName={keyName}
        setKeyName={setKeyName}
        keyScopes={keyScopes}
        setKeyScopes={setKeyScopes}
        busy={busy}
        onCreateKey={(e) => void onCreateKey(e)}
        onRevokeKey={(key) => void revokeKey(key)}
      />
    </AdminPageShell>
  );
}
