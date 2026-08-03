import { useState } from "react";
import type { ConnectInfo, McServer } from "@msm/shared";
import { Badge, Button, Stack } from "react-bootstrap";
import { TotpQr } from "./TotpQr";
import { copyText } from "../utils";

interface Props {
  server: McServer;
  connect: ConnectInfo | null;
  /** Compact header strip vs full sidebar card. */
  compact?: boolean;
  onNotice?: (message: string | null) => void;
}

export function JoinCard({ server, connect, compact, onNotice }: Props) {
  const [showQr, setShowQr] = useState(false);
  const address = connect?.address ?? `:${server.port}`;
  const directIp =
    connect?.directIp != null
      ? `${connect.directIp}:${connect.port}`
      : address;
  const playersOnline = connect?.onlinePlayers ?? 0;
  const playersMax =
    connect?.playersMax ?? (Number(connect?.maxPlayers ?? 20) || 20);
  const whitelist = connect?.whitelistEnabled ?? server.whitelistEnabled;
  const version = connect?.mcVersion ?? server.mcVersion;
  const joinUri = `minecraft://${address}`;

  async function copy(label: string, text: string) {
    try {
      await copyText(text);
      onNotice?.(`${label} copied.`);
    } catch {
      onNotice?.(null);
    }
  }

  if (compact) {
    return (
      <Stack direction="horizontal" gap={2} className="flex-wrap align-items-center">
        <Badge bg={whitelist ? "warning" : "secondary"} text={whitelist ? "dark" : undefined}>
          WL {whitelist ? "on" : "off"}
        </Badge>
        <Badge bg="dark">
          {server.status === "RUNNING" ? `${playersOnline}/${playersMax}` : `—/${playersMax}`}
        </Badge>
        <Badge bg="dark">{version}</Badge>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => void copy("Address", address)}
        >
          <i className="fa-solid fa-copy me-1" />
          Join
        </Button>
      </Stack>
    );
  }

  return (
    <div className="join-card border rounded p-3 mb-3">
      <div className="fw-semibold mb-2">
        <i className="fa-solid fa-gamepad me-2" />
        Join this server
      </div>
      <div className="small text-secondary mb-2">
        Share address, version, and whitelist status with players.
      </div>
      <dl className="row small mb-2 join-card-dl">
        <dt className="col-4 text-secondary">Address</dt>
        <dd className="col-8 font-monospace text-break mb-1">
          {address}{" "}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 align-baseline"
            onClick={() => void copy("Address", address)}
          >
            Copy
          </button>
        </dd>
        <dt className="col-4 text-secondary">Direct IP</dt>
        <dd className="col-8 font-monospace text-break mb-1">
          {directIp}{" "}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 align-baseline"
            onClick={() => void copy("Direct IP", directIp)}
          >
            Copy
          </button>
        </dd>
        <dt className="col-4 text-secondary">Whitelist</dt>
        <dd className="col-8 mb-1">{whitelist ? "On" : "Off"}</dd>
      </dl>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button size="sm" variant="primary" onClick={() => void copy("Address", address)}>
          <i className="fa-solid fa-copy me-1" />
          Copy address
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => setShowQr((v) => !v)}
        >
          <i className="fa-solid fa-qrcode me-1" />
          {showQr ? "Hide QR" : "Show QR"}
        </Button>
      </Stack>
      {showQr && (
        <div className="mt-3 d-flex flex-column align-items-center gap-2">
          <TotpQr value={joinUri} size={160} />
          <span className="small text-secondary text-break text-center">{joinUri}</span>
        </div>
      )}
    </div>
  );
}
