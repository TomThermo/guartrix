import { useState } from "react";
import type { OnlinePlayer } from "@msm/shared";
import { Spinner } from "react-bootstrap";
import { useSharedOnlinePlayers } from "../hooks/OnlinePlayersProvider";
import { PlayerActionModal } from "./PlayerActionModal";
import { PlayerHead } from "./PlayerHead";

interface Props {
  serverId: string;
  active: boolean;
  canUpdate?: boolean;
  onError?: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
}

export function ConsoleOnlineHeads({
  serverId,
  active,
  canUpdate = true,
  onError,
  onNotice,
}: Props) {
  const shared = useSharedOnlinePlayers();
  const [selected, setSelected] = useState<OnlinePlayer | null>(null);

  const players = active ? (shared?.data?.players ?? []) : [];
  const max = shared?.data?.playersMax ?? 0;
  const loading = active && !shared?.data;

  return (
    <>
      <div className="console-online-bar">
        <div className="console-online-bar-label">
          <i className="fa-solid fa-users" aria-hidden />
          <span>
            {active ? players.length : 0}
            {max > 0 ? ` / ${max}` : ""} online
          </span>
        </div>
        <div className="console-online-heads">
          {loading && players.length === 0 ? (
            <Spinner animation="border" size="sm" className="text-secondary" />
          ) : !active ? (
            <span className="console-online-empty">Server stopped</span>
          ) : players.length === 0 ? (
            <span className="console-online-empty">Nobody online</span>
          ) : (
            players.map((p) => (
              <button
                key={p.uuid ?? p.name}
                type="button"
                className="console-online-head-btn"
                data-tooltip={p.name}
                aria-label={canUpdate ? `${p.name} — manage` : p.name}
                disabled={!canUpdate}
                onClick={() => canUpdate && setSelected(p)}
              >
                <span className="console-online-head-avatar">
                  <PlayerHead uuid={p.uuid} name={p.name} size={28} title={null} />
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {selected && (
        <PlayerActionModal
          serverId={serverId}
          player={selected}
          online
          onClose={() => setSelected(null)}
          onError={(m) => onError?.(m)}
          onNotice={(m) => onNotice?.(m)}
          onDone={() => {
            setSelected(null);
            void shared?.refresh();
          }}
        />
      )}
    </>
  );
}
