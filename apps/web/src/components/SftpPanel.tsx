import { useEffect, useState } from "react";
import { Alert, Button, Card, Spinner } from "react-bootstrap";
import type { ConnectInfo } from "@msm/shared";
import { api } from "../api";
import { copyText } from "../utils";

interface Props {
  serverId: string;
  onError?: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
}

function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 border-bottom">
      <div>
        <div className="small text-secondary">{label}</div>
        <code className="user-select-all">{value}</code>
      </div>
      <Button size="sm" variant="outline-secondary" onClick={onCopy}>
        <i className="fa-solid fa-copy me-1" />
        Copy
      </Button>
    </div>
  );
}

export function SftpPanel({ serverId, onError, onNotice }: Props) {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .getConnectInfo(serverId)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, onError]);

  const copy = async (value: string, label: string) => {
    try {
      await copyText(value);
      onNotice?.(`${label} copied`);
    } catch {
      onError?.("Could not copy to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading SFTP details…
      </div>
    );
  }

  if (!info?.sftpEnabled || !info.sftpHost || !info.sftpUsername) {
    return (
      <Alert variant="secondary" className="mb-0">
        SFTP is not available for this server. The node needs a public SFTP hostname,
        and your account needs the <code>file.sftp</code> permission.
      </Alert>
    );
  }

  const host = info.sftpHost;
  const port = String(info.sftpPort ?? 2022);
  const username = info.sftpUsername;

  return (
    <>
      <div className="mb-3">
        <h2 className="h5 mb-1">SFTP Configuration</h2>
        <p className="text-secondary small mb-0">
          Account details for SFTP connections to this server&apos;s files. Use{" "}
          <strong>SFTP</strong> in your client — not FTP or FTPS. The password is your
          Guartrix panel password.
        </p>
      </div>

      <Card className="border">
        <Card.Body>
          <CopyRow
            label="Host"
            value={`sftp://${host}`}
            onCopy={() => void copy(host, "Host")}
          />
          <CopyRow
            label="Port"
            value={port}
            onCopy={() => void copy(port, "Port")}
          />
          <CopyRow
            label="Username"
            value={username}
            onCopy={() => void copy(username, "Username")}
          />
          <div className="py-2">
            <div className="small text-secondary">Password</div>
            <div>Your Guartrix panel password</div>
          </div>
        </Card.Body>
      </Card>

      <p className="small text-secondary mt-3 mb-0">
        Example FileZilla settings: protocol <strong>SFTP – SSH File Transfer Protocol</strong>,
        host <code>{host}</code>, port <code>{port}</code>, logon type Normal, user{" "}
        <code>{username}</code>.
      </p>
    </>
  );
}
