import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Form, ListGroup, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

type Row = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export function AppPasswordsPanel({ onError }: { onError?: (msg: string | null) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [max, setMax] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await api.listAppPasswords();
    setRows(data.passwords);
    setMax(data.max);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) =>
        onError?.(err instanceof Error ? err.message : t("account.appPasswordLoadFailed")),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError, t]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError?.(null);
    setNotice(null);
    setNewToken(null);
    try {
      const result = await api.createAppPassword({ name: name.trim() });
      setNewToken(result.token);
      setName("");
      setNotice(t("account.appPasswordCreated"));
      await refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(row: Row) {
    if (!confirm(t("account.appPasswordRevokeConfirm", { name: row.name }))) return;
    setBusy(true);
    onError?.(null);
    try {
      await api.revokeAppPassword(row.id);
      setNotice(t("account.appPasswordRevokedNotice"));
      await refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("apiKeys.revokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-secondary py-3">
        <Spinner size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  const active = rows.filter((r) => !r.revokedAt).length;

  return (
    <div>
      <p className="text-secondary small">{t("account.appPasswordHelp", { max })}</p>
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {newToken && (
        <Alert variant="warning">
          <strong>{t("account.appPasswordCopyNow")}</strong>
          <code className="d-block mt-2 user-select-all text-break">{newToken}</code>
        </Alert>
      )}
      <Form onSubmit={(e) => void onCreate(e)} className="mb-3">
        <Form.Control
          size="sm"
          className="mb-2"
          placeholder={t("account.appPasswordLabelPlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={64}
        />
        <Button type="submit" size="sm" disabled={busy || !name.trim() || active >= max}>
          {t("account.appPasswordCreate")}
        </Button>
      </Form>
      <ListGroup>
        {rows.length === 0 && (
          <ListGroup.Item className="text-secondary">{t("common.none")}</ListGroup.Item>
        )}
        {rows.map((row) => (
          <ListGroup.Item
            key={row.id}
            className="d-flex justify-content-between align-items-center gap-2"
          >
            <div>
              <div className="fw-semibold">{row.name}</div>
              <code className="small">{row.prefix}…</code>
              {row.revokedAt && (
                <span className="small text-secondary ms-2">
                  {t("account.appPasswordRevokedLabel")}
                </span>
              )}
            </div>
            {!row.revokedAt && (
              <Button
                size="sm"
                variant="outline-danger"
                disabled={busy}
                onClick={() => void onRevoke(row)}
              >
                {t("apiKeys.revoke")}
              </Button>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>
    </div>
  );
}
