import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthShell } from "../components/AuthShell";
import { useI18n } from "../i18n/react";

export function InvitePage() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{
    email: string | null;
    emailHint: string;
    serverId: string | null;
    serverName: string | null;
    expiresAt: string | null;
    alreadyLinked: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void api
      .getInvite(token)
      .then(setInfo)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("auth.inviteNotFound")),
      );
  }, [token, t, user?.id]);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.acceptInvite(token);
      navigate(`/servers/${res.serverId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.inviteAcceptFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("auth.inviteTitle")} subtitle={t("auth.inviteSubtitle")}>
      {!info && !error && (
        <div className="text-center py-4">
          <Spinner />
        </div>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {info && (
        <>
          <p className="mb-2">
            {user
              ? t("auth.inviteJoin", {
                  server: info.serverName ?? t("auth.inviteServerGeneric"),
                  email: info.email ?? info.emailHint,
                })
              : t("auth.inviteSignInGeneric", { email: info.emailHint })}
            {info.expiresAt
              ? ` ${t("auth.inviteExpires", {
                  when: new Date(info.expiresAt).toLocaleString(),
                })}`
              : ""}
          </p>
          {!user ? (
            <div className="d-flex flex-wrap gap-2">
              <Link
                className="btn btn-primary"
                to={`/login?next=/invite/${encodeURIComponent(token)}`}
              >
                {t("auth.signInToAccept")}
              </Link>
              <Link
                className="btn btn-outline-secondary"
                to={`/register?next=/invite/${encodeURIComponent(token)}`}
              >
                {t("auth.createAccount")}
              </Link>
            </div>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void accept()}>
              {busy ? <Spinner size="sm" /> : t("auth.acceptInvite")}
            </Button>
          )}
        </>
      )}
    </AuthShell>
  );
}
