import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthShell } from "../components/AuthShell";

export function InvitePage() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{
    email: string;
    serverId: string;
    serverName: string;
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
        setError(err instanceof Error ? err.message : "Invite not found"),
      );
  }, [token]);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.acceptInvite(token);
      navigate(`/servers/${res.serverId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Server invite" subtitle="Accept access to a Minecraft server">
      {!info && !error && (
        <div className="text-center py-4">
          <Spinner />
        </div>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {info && (
        <>
          <p className="mb-2">
            Join <strong>{info.serverName}</strong> as{" "}
            <strong>{info.email}</strong>
            {info.expiresAt
              ? ` · expires ${new Date(info.expiresAt).toLocaleString()}`
              : ""}
          </p>
          {!user ? (
            <div className="d-flex flex-wrap gap-2">
              <Link
                className="btn btn-primary"
                to={`/login?next=/invite/${encodeURIComponent(token)}`}
              >
                Sign in to accept
              </Link>
              <Link
                className="btn btn-outline-secondary"
                to={`/register?next=/invite/${encodeURIComponent(token)}`}
              >
                Create account
              </Link>
            </div>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void accept()}>
              {busy ? <Spinner size="sm" /> : "Accept invite"}
            </Button>
          )}
        </>
      )}
    </AuthShell>
  );
}
