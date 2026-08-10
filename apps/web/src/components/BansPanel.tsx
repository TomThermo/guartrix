import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BanEntry, BansResponse, IpBanEntry } from "@guartrix/shared";
import { Alert, Button, Col, Form, ListGroup, Modal, Row, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { PlayerHead } from "./PlayerHead";

interface Props {
  serverId: string;
  serverRunning: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canUpdate?: boolean;
}

type EditTarget = { kind: "player"; ban: BanEntry } | { kind: "ip"; ban: IpBanEntry } | null;

export function BansPanel({ serverId, serverRunning, onError, onNotice, canUpdate = true }: Props) {
  const { t } = useI18n();
  const [bans, setBans] = useState<BansResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerReason, setPlayerReason] = useState("Banned by an operator.");
  const [ipValue, setIpValue] = useState("");
  const [ipReason, setIpReason] = useState("Banned by an operator.");
  const [editing, setEditing] = useState<EditTarget>(null);
  const [editReason, setEditReason] = useState("");
  const [editExpires, setEditExpires] = useState("forever");

  const refresh = useCallback(async () => {
    const data = await api.getBans(serverId);
    setBans(data);
  }, [serverId]);

  useEffect(() => {
    void refresh().catch((err) =>
      onError(err instanceof Error ? err.message : t("bans.loadFailed")),
    );
  }, [refresh, onError, t]);

  async function addPlayer(e: FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    if (!playerName.trim()) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next = await api.addPlayerBan(serverId, playerName.trim(), playerReason);
      setBans(next);
      setPlayerName("");
      onNotice(
        serverRunning
          ? `Banned ${playerName.trim()} and updated the live server.`
          : `Banned ${playerName.trim()} (applies on next start).`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Ban failed");
    } finally {
      setBusy(false);
    }
  }

  async function addIp(e: FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    if (!ipValue.trim()) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next = await api.addIpBan(serverId, ipValue.trim(), ipReason);
      setBans(next);
      setIpValue("");
      onNotice(
        serverRunning
          ? `Banned IP ${ipValue.trim()} and updated the live server.`
          : `Banned IP ${ipValue.trim()} (applies on next start).`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "IP ban failed");
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(name: string) {
    if (!canUpdate) return;
    if (!confirm(`Remove ban for ${name}?`)) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next = await api.removePlayerBan(serverId, name);
      setBans(next);
      onNotice(
        serverRunning ? `Unbanned ${name} (pardon sent to server).` : `Removed ban for ${name}.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unban failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeIp(ip: string) {
    if (!canUpdate) return;
    if (!confirm(`Remove IP ban for ${ip}?`)) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next = await api.removeIpBan(serverId, ip);
      setBans(next);
      onNotice(
        serverRunning
          ? `Unbanned IP ${ip} (pardon-ip sent to server).`
          : `Removed IP ban for ${ip}.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unban failed");
    } finally {
      setBusy(false);
    }
  }

  function openEditPlayer(ban: BanEntry) {
    setEditing({ kind: "player", ban });
    setEditReason(ban.reason);
    setEditExpires(ban.expires);
  }

  function openEditIp(ban: IpBanEntry) {
    setEditing({ kind: "ip", ban });
    setEditReason(ban.reason);
    setEditExpires(ban.expires);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    if (!editing) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const next =
        editing.kind === "player"
          ? await api.updatePlayerBan(serverId, editing.ban.name, {
              reason: editReason,
              expires: editExpires,
            })
          : await api.updateIpBan(serverId, editing.ban.ip, {
              reason: editReason,
              expires: editExpires,
            });
      setBans(next);
      setEditing(null);
      onNotice(
        serverRunning ? "Ban updated and re-applied on the live server." : "Ban updated on disk.",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!bans) {
    return (
      <div className="text-center py-4 text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-3">{t("bans.title")}</h2>
      <Alert variant="light" className="border small">
        Manage player and IP bans. Removals and edits update <code>banned-players.json</code> /{" "}
        <code>banned-ips.json</code>
        {serverRunning
          ? " and send live pardon/ban commands to the running server."
          : ". Start the server to apply live; files are used on next start."}
      </Alert>

      <h3 className="h6 mb-3">
        <i className="fa-solid fa-user-slash me-2" />
        Player bans ({bans.players.length})
      </h3>
      {canUpdate && (
        <Form onSubmit={(e) => void addPlayer(e)} className="mb-3">
          <Row className="g-2">
            <Col md={4}>
              <Form.Control
                size="sm"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t("bans.player")}
                maxLength={16}
                required
                disabled={busy}
              />
            </Col>
            <Col md={5}>
              <Form.Control
                size="sm"
                value={playerReason}
                onChange={(e) => setPlayerReason(e.target.value)}
                placeholder={t("bans.reason")}
                maxLength={200}
                disabled={busy}
              />
            </Col>
            <Col md="auto">
              <Button size="sm" variant="danger" type="submit" disabled={busy}>
                Ban player
              </Button>
            </Col>
          </Row>
        </Form>
      )}

      <ListGroup className="mb-4">
        {bans.players.length === 0 && (
          <ListGroup.Item className="text-secondary">{t("bans.empty")}</ListGroup.Item>
        )}
        {bans.players.map((ban) => (
          <ListGroup.Item
            key={ban.uuid}
            className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
          >
            <div className="d-flex gap-2 align-items-center min-w-0">
              <PlayerHead uuid={ban.uuid} name={ban.name} offline />
              <div className="min-w-0">
                <div className="fw-semibold">{ban.name}</div>
                <div className="small text-secondary">{ban.reason}</div>
                <div className="small text-secondary">
                  expires {ban.expires} · {ban.source} · {ban.created}
                </div>
              </div>
            </div>
            {canUpdate && (
              <Stack direction="horizontal" gap={2}>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={busy}
                  onClick={() => openEditPlayer(ban)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={busy}
                  onClick={() => void removePlayer(ban.name)}
                >
                  {t("bans.unban")}
                </Button>
              </Stack>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>

      <h3 className="h6 mb-3">
        <i className="fa-solid fa-network-wired me-2" />
        IP bans ({bans.ips.length})
      </h3>
      {canUpdate && (
        <Form onSubmit={(e) => void addIp(e)} className="mb-3">
          <Row className="g-2">
            <Col md={4}>
              <Form.Control
                size="sm"
                value={ipValue}
                onChange={(e) => setIpValue(e.target.value)}
                placeholder="IP address"
                required
                disabled={busy}
              />
            </Col>
            <Col md={5}>
              <Form.Control
                size="sm"
                value={ipReason}
                onChange={(e) => setIpReason(e.target.value)}
                placeholder={t("bans.reason")}
                maxLength={200}
                disabled={busy}
              />
            </Col>
            <Col md="auto">
              <Button size="sm" variant="danger" type="submit" disabled={busy}>
                Ban IP
              </Button>
            </Col>
          </Row>
        </Form>
      )}

      <ListGroup>
        {bans.ips.length === 0 && (
          <ListGroup.Item className="text-secondary">{t("bans.empty")}</ListGroup.Item>
        )}
        {bans.ips.map((ban) => (
          <ListGroup.Item
            key={ban.ip}
            className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
          >
            <div className="min-w-0">
              <div className="fw-semibold font-monospace">{ban.ip}</div>
              <div className="small text-secondary">{ban.reason}</div>
              <div className="small text-secondary">
                expires {ban.expires} · {ban.source} · {ban.created}
              </div>
            </div>
            {canUpdate && (
              <Stack direction="horizontal" gap={2}>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={busy}
                  onClick={() => openEditIp(ban)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={busy}
                  onClick={() => void removeIp(ban.ip)}
                >
                  {t("bans.unban")}
                </Button>
              </Stack>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>

      <Modal show={!!editing} onHide={() => setEditing(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            Edit ban · {editing?.kind === "player" ? editing.ban.name : editing?.ban.ip}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={(e) => void saveEdit(e)}>
            <Form.Group className="mb-3">
              <Form.Label>Reason</Form.Label>
              <Form.Control
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                maxLength={200}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Expires</Form.Label>
              <Form.Control
                value={editExpires}
                onChange={(e) => setEditExpires(e.target.value)}
                placeholder="forever"
              />
            </Form.Group>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
}
