import { useState } from "react";
import type { ConnectInfo, McServer } from "@msm/shared";
import { Button, Stack } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { TotpQr } from "./TotpQr";
import { copyText } from "../utils";

interface Props {
  server: McServer;
  connect: ConnectInfo | null;
  /** Compact header strip vs full sidebar card. */
  compact?: boolean;
  onNotice?: (message: string | null) => void;
}

function JoinRow({
  icon,
  label,
  value,
  mono,
  tone,
  onCopy,
  copyTitle,
}: {
  icon: string;
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "success" | "warning";
  onCopy?: () => void;
  copyTitle?: string;
}) {
  return (
    <div className="join-card__row">
      <span className={`join-card__icon join-card__icon--${tone ?? "neutral"}`} aria-hidden>
        <i className={`fa-solid ${icon}`} />
      </span>
      <div className="join-card__copy min-w-0">
        <span className="join-card__label">{label}</span>
        <span className={`join-card__value ${mono ? "font-monospace" : ""}`}>{value}</span>
      </div>
      {onCopy && (
        <button
          type="button"
          className="join-card__copy-btn"
          title={copyTitle}
          onClick={() => void onCopy()}
        >
          <i className="fa-solid fa-copy" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function JoinCard({ server, connect, compact, onNotice }: Props) {
  const { t } = useI18n();
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
      onNotice?.(t("joinCard.copied", { label }));
    } catch {
      onNotice?.(null);
    }
  }

  if (compact) {
    return (
      <Stack direction="horizontal" gap={2} className="join-card-compact flex-wrap align-items-center">
        <span className={`join-card-compact__chip ${whitelist ? "is-on" : ""}`}>
          <i className={`fa-solid ${whitelist ? "fa-shield-halved" : "fa-shield"}`} aria-hidden />
          {whitelist ? t("serverDetail.wlOn") : t("serverDetail.wlOff")}
        </span>
        <span className="join-card-compact__chip">
          <i className="fa-solid fa-users" aria-hidden />
          {server.status === "RUNNING" ? `${playersOnline}/${playersMax}` : `—/${playersMax}`}
        </span>
        <span className="join-card-compact__chip">
          <i className="fa-solid fa-cube" aria-hidden />
          {version}
        </span>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => void copy(t("joinCard.address"), address)}
        >
          <i className="fa-solid fa-copy" aria-hidden />
          {t("joinCard.join")}
        </Button>
      </Stack>
    );
  }

  return (
    <section className="join-card">
      <div className="join-card__head">
        <span className="join-card__head-icon" aria-hidden>
          <i className="fa-solid fa-gamepad" />
        </span>
        <div className="min-w-0">
          <h4 className="join-card__title">{t("joinCard.title")}</h4>
          <p className="join-card__subtitle">{t("joinCard.subtitle")}</p>
        </div>
      </div>

      <div className="join-card__rows">
        <JoinRow
          icon="fa-globe"
          label={t("joinCard.address")}
          value={address}
          mono
          onCopy={() => void copy(t("joinCard.address"), address)}
          copyTitle={t("common.copy")}
        />
        <JoinRow
          icon="fa-earth-americas"
          label={t("joinCard.directIp")}
          value={directIp}
          mono
          onCopy={() => void copy(t("joinCard.directIp"), directIp)}
          copyTitle={t("common.copy")}
        />
        <JoinRow
          icon={whitelist ? "fa-shield-halved" : "fa-shield"}
          label={t("joinCard.whitelist")}
          value={whitelist ? t("common.on") : t("common.off")}
          tone={whitelist ? "success" : "warning"}
        />
      </div>

      <div className="join-card__actions">
        <Button size="sm" variant="primary" onClick={() => void copy(t("joinCard.address"), address)}>
          <i className="fa-solid fa-copy" aria-hidden />
          {t("joinCard.copyAddress")}
        </Button>
        <Button size="sm" variant="outline-secondary" onClick={() => setShowQr((v) => !v)}>
          <i className="fa-solid fa-qrcode" aria-hidden />
          {showQr ? t("joinCard.hideQr") : t("joinCard.showQr")}
        </Button>
      </div>

      {showQr && (
        <div className="join-card__qr">
          <TotpQr value={joinUri} size={160} />
          <span className="join-card__qr-uri font-monospace">{joinUri}</span>
        </div>
      )}
    </section>
  );
}
