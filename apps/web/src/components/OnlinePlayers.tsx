import { useState } from "react";
import type { OnlinePlayer, PlayerHistoryEntry } from "@msm/shared";
import { Badge, Card, ListGroup, Spinner } from "react-bootstrap";
import { useSharedOnlinePlayers } from "../hooks/OnlinePlayersProvider";
import { useI18n } from "../i18n/react";
import { formatWhen } from "../utils";
import { PlayerActionModal } from "./PlayerActionModal";
import { PlayerHead } from "./PlayerHead";

interface Props {
  serverId: string;
  active: boolean;
  onError?: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  canUpdate?: boolean;
}

export function OnlinePlayers({ serverId, active, onError, onNotice, canUpdate = true }: Props) {
  const { t } = useI18n();
  const shared = useSharedOnlinePlayers();
  const data = shared?.data ?? null;
  const refresh = shared?.refresh ?? (async () => undefined);
  const [selected, setSelected] = useState<{
    player: OnlinePlayer;
    online: boolean;
  } | null>(null);

  function openOnline(p: OnlinePlayer) {
    if (!canUpdate) return;
    setSelected({ player: p, online: true });
  }

  function openHistory(h: PlayerHistoryEntry) {
    if (!canUpdate) return;
    setSelected({
      player: { name: h.name, uuid: h.uuid },
      online: false,
    });
  }

  if (!data && active) {
    return (
      <div className="text-center py-4 text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  if (!data) {
    return (
      <Card body className="text-secondary">
        Start the server to track online players. History appears after first joins.
      </Card>
    );
  }

  const maxLabel = data.playersMax > 0 ? ` / ${data.playersMax}` : "";

  return (
    <div>
      <h2 className="h5 mb-3">{t("players.title")}</h2>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <strong>
          <i className="fa-solid fa-users me-2 text-success" />
          {active ? data.playersOnline : 0}
          {maxLabel} online
        </strong>
        {data.latencyMs != null && data.online && (
          <span className="text-secondary small">{data.latencyMs} ms</span>
        )}
      </div>

      {!active && (
        <p className="text-secondary small">
          Server is stopped — online list is empty; history below remains.
        </p>
      )}

      {active && data.players.length === 0 ? (
        <p className="text-secondary small">{t("players.empty")}</p>
      ) : active ? (
        <ListGroup className="mb-4">
          {data.players.map((p) => (
            <ListGroup.Item
              key={p.uuid ?? p.name}
              action={canUpdate}
              className="d-flex justify-content-between align-items-center"
              onClick={() => openOnline(p)}
            >
              <div className="d-flex gap-2 align-items-center min-w-0">
                <PlayerHead uuid={p.uuid} name={p.name} />
                <div className="min-w-0">
                  <div className="fw-semibold text-truncate">{p.name}</div>
                  {p.uuid && <div className="small text-secondary text-truncate">{p.uuid}</div>}
                </div>
              </div>
              <span className="online-dot" title="Online" />
            </ListGroup.Item>
          ))}
        </ListGroup>
      ) : null}

      <h3 className="h6 mb-1">
        <i className="fa-solid fa-clock-rotate-left me-2" />
        History
      </h3>
      <p className="text-secondary small mb-3">
        {canUpdate
          ? "Players who left stay here. Click for ban, OP, whitelist and other offline actions."
          : "Players who left stay here. You have read-only access to this list."}
      </p>
      {data.history.length === 0 ? (
        <p className="text-secondary small">No player history yet.</p>
      ) : (
        <ListGroup>
          {data.history.map((h) => (
            <ListGroup.Item
              key={`hist-${h.uuid ?? h.name}`}
              action={canUpdate}
              className="d-flex justify-content-between align-items-center"
              onClick={() => openHistory(h)}
            >
              <div className="d-flex gap-2 align-items-center min-w-0">
                <PlayerHead uuid={h.uuid} name={h.name} offline />
                <div className="min-w-0">
                  <div className="fw-semibold text-truncate">{h.name}</div>
                  <div className="small text-secondary">
                    Left {formatWhen(h.lastLeftAt ?? h.lastSeenAt)}
                  </div>
                </div>
              </div>
              <Badge bg="secondary">Offline</Badge>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}

      {selected && (
        <PlayerActionModal
          serverId={serverId}
          player={selected.player}
          online={selected.online}
          onClose={() => setSelected(null)}
          onError={(msg) => onError?.(msg)}
          onNotice={(msg) => onNotice?.(msg)}
          onDone={() => void refresh()}
        />
      )}
    </div>
  );
}
