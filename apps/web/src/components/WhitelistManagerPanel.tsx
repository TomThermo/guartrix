import { useEffect, useState, type FormEvent } from "react";
import type { PlayersResponse, ServerDetail, ServerProperties } from "@msm/shared";
import { isBdsServerType } from "@msm/shared";
import { Button, Form } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { PlayerHead } from "./PlayerHead";

interface Props {
  server: ServerDetail;
  onSaved: (server: ServerDetail) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  canUpdate?: boolean;
}

function bool(v: string | undefined, fallback = false): string {
  if (v === "true" || v === "false") return v;
  return fallback ? "true" : "false";
}

export function WhitelistManagerPanel({
  server,
  onSaved,
  onError,
  onNotice,
  canUpdate = true,
}: Props) {
  const { t } = useI18n();
  const isBedrock = isBdsServerType(server.type);
  const [players, setPlayers] = useState<PlayersResponse>(server.players);
  const [props, setProps] = useState<ServerProperties>({ ...server.properties });
  const [wlName, setWlName] = useState("");
  const [opName, setOpName] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingFlags, setSavingFlags] = useState(false);

  useEffect(() => {
    setPlayers(server.players);
    setProps({ ...server.properties });
  }, [server]);

  async function saveFlags(e: FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    setSavingFlags(true);
    onError(null);
    try {
      const updated = await api.updateServer(server.id, {
        properties: isBedrock
          ? { "white-list": props["white-list"] ?? "false" }
          : {
              "white-list": props["white-list"] ?? "false",
              "enforce-whitelist": props["enforce-whitelist"] ?? "false",
            },
      });
      onSaved(updated);
      setProps({ ...updated.properties });
      setPlayers(updated.players);
      onNotice?.("Whitelist settings saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFlags(false);
    }
  }

  async function addWl(e: FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      const next = await api.addWhitelist(server.id, wlName);
      setPlayers(next);
      setWlName("");
      onNotice?.(`Added ${wlName.trim()} to the whitelist.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Whitelist add failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeWl(playerName: string) {
    if (!canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      setPlayers(await api.removeWhitelist(server.id, playerName));
      onNotice?.(`Removed ${playerName} from the whitelist.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function addOperator(e: FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      const next = await api.addOp(server.id, opName);
      setPlayers(next);
      setOpName("");
      onNotice?.(`${opName.trim()} is now an operator.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "OP add failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeOperator(playerName: string) {
    if (!canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      setPlayers(await api.removeOp(server.id, playerName));
      onNotice?.(`Removed operator ${playerName}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Deop failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whitelist-manager">
      <header className="wl-page-header">
        <h2 className="wl-page-title">{t("whitelist.title")}</h2>
        <p className="wl-page-desc">
          Control who can join and who has operator rights.
          {server.status === "RUNNING"
            ? " Changes are applied live on the running server."
            : " List changes apply on next start."}
          {isBedrock && (
            <>
              {" "}
              Bedrock uses Xbox gamertags (not Mojang Java names) and{" "}
              <code>allow-list</code> in server.properties.
            </>
          )}
        </p>
      </header>

      <section className="wl-card">
        <h3 className="wl-card-title">Settings</h3>
        <Form onSubmit={(e) => void saveFlags(e)} className="wl-settings-grid">
          <div className="wl-settings-item">
            <span className="wl-label">{isBedrock ? "Allowlist" : "Whitelist"}</span>
            <Form.Select
              value={bool(props["white-list"])}
              disabled={!canUpdate}
              onChange={(e) =>
                setProps((prev) => ({ ...prev, "white-list": e.target.value }))
              }
            >
              <option value="true">{t("whitelist.enabled")}</option>
              <option value="false">{t("whitelist.disabled")}</option>
            </Form.Select>
          </div>
          {!isBedrock && (
            <div className="wl-settings-item">
              <span className="wl-label">Enforce whitelist</span>
              <Form.Select
                value={bool(props["enforce-whitelist"])}
                disabled={!canUpdate}
                onChange={(e) =>
                  setProps((prev) => ({
                    ...prev,
                    "enforce-whitelist": e.target.value,
                  }))
                }
              >
                <option value="true">{t("whitelist.enabled")}</option>
                <option value="false">{t("whitelist.disabled")}</option>
              </Form.Select>
            </div>
          )}
          {canUpdate && (
            <div className="wl-settings-action">
              <Button type="submit" variant="primary" disabled={savingFlags}>
                {savingFlags ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          )}
        </Form>
      </section>

      <section className="wl-card">
        <h3 className="wl-card-title">{isBedrock ? "Allowlist" : "Whitelist"}</h3>
        {canUpdate && (
          <Form onSubmit={(e) => void addWl(e)} className="wl-add-row">
            <Form.Control
              value={wlName}
              onChange={(e) => setWlName(e.target.value)}
              placeholder={t("whitelist.player")}
              maxLength={16}
              required
            />
            <Button variant="primary" disabled={busy} type="submit">
              Add
            </Button>
          </Form>
        )}
        {players.whitelist.length === 0 ? (
          <p className="wl-empty">{t("whitelist.empty")}</p>
        ) : (
          <div className="wl-player-grid">
            {players.whitelist.map((p) => (
              <div key={`${p.name}-${p.uuid}`} className="wl-player-chip" title={p.uuid}>
                <PlayerHead uuid={p.uuid} name={p.name} size={28} />
                <span className="wl-player-name">{p.name}</span>
                {canUpdate && (
                  <button
                    type="button"
                    className="wl-player-remove"
                    disabled={busy}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => void removeWl(p.name)}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="wl-card">
        <h3 className="wl-card-title">Operators</h3>
        {canUpdate && (
          <Form onSubmit={(e) => void addOperator(e)} className="wl-add-row">
            <Form.Control
              value={opName}
              onChange={(e) => setOpName(e.target.value)}
              placeholder={t("whitelist.player")}
              maxLength={16}
              required
            />
            <Button variant="primary" disabled={busy} type="submit">
              Make OP
            </Button>
          </Form>
        )}
        {players.ops.length === 0 ? (
          <p className="wl-empty">No operators</p>
        ) : (
          <div className="wl-player-grid">
            {players.ops.map((p) => (
              <div
                key={p.uuid}
                className="wl-player-chip"
                title={`level ${p.level} · ${p.uuid}`}
              >
                <PlayerHead uuid={p.uuid} name={p.name} size={28} />
                <span className="wl-player-name">{p.name}</span>
                <span className="wl-player-meta">L{p.level}</span>
                {canUpdate && (
                  <button
                    type="button"
                    className="wl-player-remove"
                    disabled={busy}
                    aria-label={`Deop ${p.name}`}
                    onClick={() => void removeOperator(p.name)}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="wl-card">
        <h3 className="wl-card-title">Banned players</h3>
        <p className="wl-card-hint">
          Manage bans in the <strong>Bans</strong> menu.
        </p>
        {players.bannedPlayers.length === 0 ? (
          <p className="wl-empty">No bans on file</p>
        ) : (
          <div className="wl-player-grid">
            {players.bannedPlayers.map((p) => (
              <div
                key={p.uuid}
                className="wl-player-chip is-banned"
                title={p.reason || p.uuid}
              >
                <PlayerHead uuid={p.uuid} name={p.name} size={28} offline />
                <span className="wl-player-name">{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
