import { useState, type FormEvent } from "react";
import type { OnlinePlayer } from "@msm/shared";
import { Badge, Button, Form, InputGroup, Modal, Stack } from "react-bootstrap";
import { api } from "../api";
import { PlayerHead } from "./PlayerHead";

export const DEFAULT_GIVE_ITEMS = [
  { id: "minecraft:diamond", label: "Diamond" },
  { id: "minecraft:diamond_sword", label: "Diamond Sword" },
  { id: "minecraft:diamond_pickaxe", label: "Diamond Pickaxe" },
  { id: "minecraft:diamond_axe", label: "Diamond Axe" },
  { id: "minecraft:netherite_ingot", label: "Netherite Ingot" },
  { id: "minecraft:netherite_sword", label: "Netherite Sword" },
  { id: "minecraft:golden_apple", label: "Golden Apple" },
  { id: "minecraft:enchanted_golden_apple", label: "Enchanted Golden Apple" },
  { id: "minecraft:cooked_beef", label: "Steak" },
  { id: "minecraft:bread", label: "Bread" },
  { id: "minecraft:ender_pearl", label: "Ender Pearl" },
  { id: "minecraft:ender_eye", label: "Eye of Ender" },
  { id: "minecraft:experience_bottle", label: "XP Bottle" },
  { id: "minecraft:elytra", label: "Elytra" },
  { id: "minecraft:firework_rocket", label: "Firework Rocket" },
  { id: "minecraft:totem_of_undying", label: "Totem of Undying" },
  { id: "minecraft:bow", label: "Bow" },
  { id: "minecraft:arrow", label: "Arrow" },
  { id: "minecraft:shield", label: "Shield" },
  { id: "minecraft:oak_log", label: "Oak Log" },
  { id: "minecraft:cobblestone", label: "Cobblestone" },
  { id: "minecraft:torch", label: "Torch" },
  { id: "minecraft:water_bucket", label: "Water Bucket" },
  { id: "minecraft:lava_bucket", label: "Lava Bucket" },
] as const;

type PlayerAction =
  | "kick"
  | "ban"
  | "pardon"
  | "op"
  | "deop"
  | "whisper"
  | "give"
  | "gamemode"
  | "kill"
  | "clear"
  | "whitelist_add"
  | "whitelist_remove";

const ONLINE_ONLY = new Set<PlayerAction>([
  "kick",
  "whisper",
  "give",
  "gamemode",
  "kill",
  "clear",
]);

interface Props {
  serverId: string;
  player: OnlinePlayer;
  online?: boolean;
  onClose: () => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onDone?: () => void;
}

export function PlayerActionModal({
  serverId,
  player,
  online = true,
  onClose,
  onError,
  onNotice,
  onDone,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [whisper, setWhisper] = useState("");
  const [reason, setReason] = useState("");
  const [item, setItem] = useState<string>(DEFAULT_GIVE_ITEMS[0].id);
  const [customItem, setCustomItem] = useState("");
  const [count, setCount] = useState(1);
  const [gamemode, setGamemode] = useState("survival");

  function can(action: PlayerAction): boolean {
    if (!online && ONLINE_ONLY.has(action)) return false;
    return true;
  }

  async function run(action: PlayerAction, extra?: Record<string, unknown>) {
    if (!can(action)) {
      onError("That action requires the player to be online.");
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.playerAction(serverId, {
        action,
        name: player.name,
        ...extra,
      });
      onNotice(`Sent: /${result.command}`);
      onDone?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function onWhisper(e: FormEvent) {
    e.preventDefault();
    if (!whisper.trim()) return;
    await run("whisper", { message: whisper.trim() });
    setWhisper("");
  }

  async function onGive(e: FormEvent) {
    e.preventDefault();
    const chosen = customItem.trim() || item;
    await run("give", { item: chosen, count });
  }

  return (
    <Modal show onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2">
          <PlayerHead uuid={player.uuid} name={player.name} size={40} offline={!online} />
          <div>
            <div>{player.name}</div>
            <Badge bg={online ? "success" : "secondary"} className="fw-normal">
              {online ? "Online" : "Offline"}
            </Badge>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {player.uuid && (
          <div className="small text-secondary font-monospace mb-3">{player.uuid}</div>
        )}
        {!online && (
          <p className="small text-secondary">
            Player is offline — kick, whisper, give, gamemode, kill and clear are disabled. Ban, OP
            and whitelist still work when the server is running.
          </p>
        )}

        <h6>Moderation</h6>
        <Stack direction="horizontal" gap={2} className="flex-wrap mb-2">
          <Button size="sm" variant="outline-secondary" disabled={busy || !can("kick")} onClick={() => void run("kick", { reason })}>
            Kick
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || !can("ban")}
            onClick={() => {
              if (!confirm(`Ban ${player.name}?`)) return;
              void run("ban", { reason });
            }}
          >
            Ban
          </Button>
          <Button size="sm" variant="outline-secondary" disabled={busy || !can("pardon")} onClick={() => void run("pardon")}>
            Unban
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || !can("kill")}
            onClick={() => {
              if (!confirm(`Kill ${player.name}?`)) return;
              void run("kill");
            }}
          >
            Kill
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={busy || !can("clear")}
            onClick={() => {
              if (!confirm(`Clear inventory of ${player.name}?`)) return;
              void run("clear");
            }}
          >
            Clear inv
          </Button>
        </Stack>
        <Form.Control
          className="mb-3"
          size="sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Kick/ban reason (optional)"
          maxLength={100}
        />

        <h6>Permissions</h6>
        <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
          <Button size="sm" variant="primary" disabled={busy || !can("op")} onClick={() => void run("op")}>
            Make OP
          </Button>
          <Button size="sm" variant="outline-secondary" disabled={busy || !can("deop")} onClick={() => void run("deop")}>
            Deop
          </Button>
          <Button size="sm" variant="outline-secondary" disabled={busy || !can("whitelist_add")} onClick={() => void run("whitelist_add")}>
            Whitelist
          </Button>
          <Button size="sm" variant="outline-secondary" disabled={busy || !can("whitelist_remove")} onClick={() => void run("whitelist_remove")}>
            Unwhitelist
          </Button>
        </Stack>

        <h6>Gamemode</h6>
        <InputGroup size="sm" className="mb-3" style={{ maxWidth: 320 }}>
          <Form.Select
            value={gamemode}
            onChange={(e) => setGamemode(e.target.value)}
            disabled={busy || !can("gamemode")}
          >
            <option value="survival">Survival</option>
            <option value="creative">Creative</option>
            <option value="adventure">Adventure</option>
            <option value="spectator">Spectator</option>
          </Form.Select>
          <Button variant="primary" disabled={busy || !can("gamemode")} onClick={() => void run("gamemode", { gamemode })}>
            Set
          </Button>
        </InputGroup>

        <h6>Whisper</h6>
        <Form onSubmit={(e) => void onWhisper(e)} className="mb-3">
          <InputGroup size="sm">
            <Form.Control
              value={whisper}
              onChange={(e) => setWhisper(e.target.value)}
              placeholder={`Message to ${player.name}…`}
              maxLength={256}
              disabled={busy || !can("whisper")}
            />
            <Button type="submit" variant="primary" disabled={busy || !can("whisper") || !whisper.trim()}>
              Send
            </Button>
          </InputGroup>
        </Form>

        <h6>Give items</h6>
        <Form onSubmit={(e) => void onGive(e)}>
          <Stack gap={2}>
            <Form.Select
              size="sm"
              value={item}
              onChange={(e) => {
                setItem(e.target.value);
                setCustomItem("");
              }}
              disabled={busy || !can("give")}
            >
              {DEFAULT_GIVE_ITEMS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Form.Select>
            <InputGroup size="sm">
              <Form.Control
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                placeholder="Or custom id (diamond_block)"
                disabled={busy || !can("give")}
              />
              <Form.Control
                type="number"
                min={1}
                max={2304}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                disabled={busy || !can("give")}
                style={{ maxWidth: 90 }}
                aria-label="Count"
              />
              <Button type="submit" variant="primary" disabled={busy || !can("give")}>
                Give
              </Button>
            </InputGroup>
          </Stack>
        </Form>
      </Modal.Body>
    </Modal>
  );
}
