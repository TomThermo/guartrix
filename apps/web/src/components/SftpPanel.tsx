import { useEffect, useState } from "react";
import { Alert, Button, Card, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import type { ConnectInfo } from "@guartrix/shared";
import { api } from "../api";
import { useI18n } from "../i18n/react";
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
  copyLabel,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copyLabel: string;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 border-bottom">
      <div>
        <div className="small text-secondary">{label}</div>
        <code className="user-select-all">{value}</code>
      </div>
      <Button size="sm" variant="outline-secondary" onClick={onCopy}>
        <i className="fa-solid fa-copy me-1" />
        {copyLabel}
      </Button>
    </div>
  );
}

export function SftpPanel({ serverId, onError, onNotice }: Props) {
  const { t } = useI18n();
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
      onNotice?.(t("common.copied", { label }));
    } catch {
      onError?.(t("common.copyFailed"));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  if (!info?.sftpEnabled || !info.sftpHost || !info.sftpUsername) {
    return (
      <Alert variant="secondary" className="mb-0">
        {t("sftp.unavailable")}
      </Alert>
    );
  }

  const host = info.sftpHost;
  const port = String(info.sftpPort ?? 2022);
  const username = info.sftpUsername;

  return (
    <>
      <div className="mb-3">
        <h2 className="h5 mb-1">{t("sftp.title")}</h2>
        <p className="text-secondary small mb-2">{t("sftp.help")}</p>
        <Link to="/account/security?tab=access" className="small">
          <i className="fa-solid fa-key me-1" aria-hidden />
          {t("sftp.manageAppPasswords")}
        </Link>
      </div>

      <Card className="border">
        <Card.Body>
          <CopyRow
            label={t("sftp.host")}
            value={`sftp://${host}`}
            onCopy={() => void copy(host, t("sftp.host"))}
            copyLabel={t("common.copy")}
          />
          <CopyRow
            label={t("sftp.port")}
            value={port}
            onCopy={() => void copy(port, t("sftp.port"))}
            copyLabel={t("common.copy")}
          />
          <CopyRow
            label={t("sftp.username")}
            value={username}
            onCopy={() => void copy(username, t("sftp.username"))}
            copyLabel={t("common.copy")}
          />
          <div className="py-2">
            <div className="small text-secondary">{t("sftp.password")}</div>
            <div>{t("sftp.panelPassword")}</div>
          </div>
        </Card.Body>
      </Card>

      <p className="small text-secondary mt-3 mb-0">
        {t("sftp.filezillaExample", { host, port, username })}
      </p>
    </>
  );
}
