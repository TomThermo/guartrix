import type { BotInfo } from "@msm/shared";
import { Button, Col, Form, Row } from "react-bootstrap";
import type { CmdType } from "./buildBotCommand";

const AI_HINTS =
  'Examples: "wander", "stop", "follow Steve", "chop birch_log", "goto Steve", "guard 8", "attack", "dig stone"';

/** All vanilla logs / stems bots can chop (dropdown). */
const CHOP_LOG_OPTIONS: { value: string; label: string }[] = [
  { value: "oak_log", label: "Oak log" },
  { value: "spruce_log", label: "Spruce log" },
  { value: "birch_log", label: "Birch log" },
  { value: "jungle_log", label: "Jungle log" },
  { value: "acacia_log", label: "Acacia log" },
  { value: "dark_oak_log", label: "Dark oak log" },
  { value: "mangrove_log", label: "Mangrove log" },
  { value: "cherry_log", label: "Cherry log" },
  { value: "pale_oak_log", label: "Pale oak log" },
  { value: "crimson_stem", label: "Crimson stem" },
  { value: "warped_stem", label: "Warped stem" },
  { value: "stripped_oak_log", label: "Stripped oak log" },
  { value: "stripped_spruce_log", label: "Stripped spruce log" },
  { value: "stripped_birch_log", label: "Stripped birch log" },
  { value: "stripped_jungle_log", label: "Stripped jungle log" },
  { value: "stripped_acacia_log", label: "Stripped acacia log" },
  { value: "stripped_dark_oak_log", label: "Stripped dark oak log" },
  { value: "stripped_mangrove_log", label: "Stripped mangrove log" },
  { value: "stripped_cherry_log", label: "Stripped cherry log" },
  { value: "stripped_pale_oak_log", label: "Stripped pale oak log" },
  { value: "stripped_crimson_stem", label: "Stripped crimson stem" },
  { value: "stripped_warped_stem", label: "Stripped warped stem" },
];

interface Props {
  bots: BotInfo[];
  selected: string;
  onSelectedChange: (username: string) => void;
  broadcast: boolean;
  onBroadcastChange: (value: boolean) => void;
  cmdType: CmdType;
  onCmdTypeChange: (value: CmdType) => void;
  aiPrompt: string;
  onAiPromptChange: (value: string) => void;
  sayText: string;
  onSayTextChange: (value: string) => void;
  yaw: number;
  onYawChange: (value: number) => void;
  pitch: number;
  onPitchChange: (value: number) => void;
  gotoMode: "coords" | "player";
  onGotoModeChange: (value: "coords" | "player") => void;
  gotoX: number;
  onGotoXChange: (value: number) => void;
  gotoY: number;
  onGotoYChange: (value: number) => void;
  gotoZ: number;
  onGotoZChange: (value: number) => void;
  playerName: string;
  onPlayerNameChange: (value: string) => void;
  onlineHumans: string[];
  itemName: string;
  onItemNameChange: (value: string) => void;
  chopLog: string;
  onChopLogChange: (value: string) => void;
  guardRadius: number;
  onGuardRadiusChange: (value: number) => void;
  busy: boolean;
  onSubmit: () => void;
}

export function BotCommandForm({
  bots,
  selected,
  onSelectedChange,
  broadcast,
  onBroadcastChange,
  cmdType,
  onCmdTypeChange,
  aiPrompt,
  onAiPromptChange,
  sayText,
  onSayTextChange,
  yaw,
  onYawChange,
  pitch,
  onPitchChange,
  gotoMode,
  onGotoModeChange,
  gotoX,
  onGotoXChange,
  gotoY,
  onGotoYChange,
  gotoZ,
  onGotoZChange,
  playerName,
  onPlayerNameChange,
  onlineHumans,
  itemName,
  onItemNameChange,
  chopLog,
  onChopLogChange,
  guardRadius,
  onGuardRadiusChange,
  busy,
  onSubmit,
}: Props) {
  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="border rounded p-3 bg-body-tertiary"
    >
      <h3 className="h6 mb-1">Orders</h3>
      <p className="small text-secondary mb-3">{AI_HINTS}</p>
      <Row className="g-2 align-items-end">
        <Col md={3}>
          <Form.Group controlId="bot-target">
            <Form.Label className="small mb-1">Bot</Form.Label>
            <Form.Select
              value={selected}
              onChange={(e) => onSelectedChange(e.target.value)}
              disabled={busy || bots.length === 0 || broadcast}
            >
              {bots.length === 0 && <option value="">—</option>}
              {bots.map((b) => (
                <option key={b.username} value={b.username}>
                  {b.username}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group controlId="bot-cmd">
            <Form.Label className="small mb-1">Action</Form.Label>
            <Form.Select
              value={cmdType}
              onChange={(e) => onCmdTypeChange(e.target.value as CmdType)}
              disabled={busy}
            >
              <option value="ai">ai (free text)</option>
              <option value="wander">wander</option>
              <option value="stop">stop</option>
              <option value="follow">follow</option>
              <option value="goto">goto</option>
              <option value="chop">chop (until stop)</option>
              <option value="collect">collect</option>
              <option value="dig">dig</option>
              <option value="attack">attack</option>
              <option value="guard">guard</option>
              <option value="jump">jump</option>
              <option value="say">say</option>
              <option value="look">look</option>
              <option value="quit">quit</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={3} className="d-flex align-items-end pb-1">
          <Form.Check
            type="checkbox"
            id="bot-broadcast"
            label="Send to all bots"
            checked={broadcast}
            onChange={(e) => onBroadcastChange(e.target.checked)}
            disabled={busy || bots.length === 0}
          />
        </Col>
      </Row>

      <Row className="g-2 align-items-end mt-2">
        {cmdType === "ai" && (
          <Col md={8}>
            <Form.Group controlId="bot-ai">
              <Form.Label className="small mb-1">AI prompt</Form.Label>
              <Form.Control
                value={aiPrompt}
                onChange={(e) => onAiPromptChange(e.target.value)}
                placeholder="chop birch_log / follow Steve / stop"
                disabled={busy}
              />
            </Form.Group>
          </Col>
        )}
        {cmdType === "say" && (
          <Col md={6}>
            <Form.Control
              value={sayText}
              onChange={(e) => onSayTextChange(e.target.value)}
              disabled={busy}
              placeholder="Chat message"
            />
          </Col>
        )}
        {cmdType === "look" && (
          <>
            <Col md={2}>
              <Form.Control
                type="number"
                step="0.1"
                value={yaw}
                onChange={(e) => onYawChange(Number(e.target.value))}
                disabled={busy}
                placeholder="yaw"
              />
            </Col>
            <Col md={2}>
              <Form.Control
                type="number"
                step="0.1"
                value={pitch}
                onChange={(e) => onPitchChange(Number(e.target.value))}
                disabled={busy}
                placeholder="pitch"
              />
            </Col>
          </>
        )}
        {cmdType === "goto" && (
          <>
            <Col md={3}>
              <Form.Select
                value={gotoMode}
                onChange={(e) =>
                  onGotoModeChange(e.target.value as "coords" | "player")
                }
                disabled={busy}
              >
                <option value="player">Online player</option>
                <option value="coords">Coordinates</option>
              </Form.Select>
            </Col>
            {gotoMode === "player" ? (
              <Col md={4}>
                <Form.Select
                  value={playerName}
                  onChange={(e) => onPlayerNameChange(e.target.value)}
                  disabled={busy || onlineHumans.length === 0}
                >
                  {onlineHumans.length === 0 ? (
                    <option value="">No real players online</option>
                  ) : (
                    onlineHumans.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  )}
                </Form.Select>
                <Form.Text className="text-secondary">
                  Bots walk to that player&apos;s current position (must be
                  visible to them).
                </Form.Text>
              </Col>
            ) : (
              <>
                <Col md={2}>
                  <Form.Control
                    type="number"
                    value={gotoX}
                    onChange={(e) => onGotoXChange(Number(e.target.value))}
                    disabled={busy}
                    placeholder="x"
                  />
                </Col>
                <Col md={2}>
                  <Form.Control
                    type="number"
                    value={gotoY}
                    onChange={(e) => onGotoYChange(Number(e.target.value))}
                    disabled={busy}
                    placeholder="y"
                  />
                </Col>
                <Col md={2}>
                  <Form.Control
                    type="number"
                    value={gotoZ}
                    onChange={(e) => onGotoZChange(Number(e.target.value))}
                    disabled={busy}
                    placeholder="z"
                  />
                </Col>
              </>
            )}
          </>
        )}
        {(cmdType === "follow" || cmdType === "attack") && (
          <Col md={4}>
            <Form.Select
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              disabled={busy}
            >
              {cmdType === "attack" && <option value="">Nearest mob</option>}
              {onlineHumans.length === 0 && cmdType === "follow" && (
                <option value="">No real players online</option>
              )}
              {onlineHumans.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Form.Select>
          </Col>
        )}
        {cmdType === "chop" && (
          <Col md={4}>
            <Form.Group controlId="bot-chop-log">
              <Form.Label className="small mb-1">Log type</Form.Label>
              <Form.Select
                value={chopLog}
                onChange={(e) => onChopLogChange(e.target.value)}
                disabled={busy}
              >
                {CHOP_LOG_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-secondary">
                Keeps chopping this wood until you press Stop. Bots take
                different trees.
              </Form.Text>
            </Form.Group>
          </Col>
        )}
        {(cmdType === "collect" || cmdType === "dig") && (
          <Col md={4}>
            <Form.Control
              value={itemName}
              onChange={(e) => onItemNameChange(e.target.value)}
              disabled={busy}
              placeholder={
                cmdType === "dig"
                  ? "Block name (optional)"
                  : "Item/block e.g. oak_log"
              }
            />
          </Col>
        )}
        {cmdType === "guard" && (
          <Col md={2}>
            <Form.Control
              type="number"
              min={2}
              max={32}
              value={guardRadius}
              onChange={(e) => onGuardRadiusChange(Number(e.target.value) || 8)}
              disabled={busy}
              placeholder="radius"
            />
          </Col>
        )}
        <Col xs="auto">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (!broadcast && !selected)}
          >
            <i className="fa-solid fa-paper-plane me-1" />
            Send
          </Button>
        </Col>
      </Row>
    </Form>
  );
}
