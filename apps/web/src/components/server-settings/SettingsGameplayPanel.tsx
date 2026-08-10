import type { ServerProperties } from "@guartrix/shared";
import { Col, Form, Row } from "react-bootstrap";
import { BoolSelect, Field, bool } from "./settings-fields";

export function SettingsGameplayPanel({
  props,
  setProp,
  settingsEditable,
}: {
  props: ServerProperties;
  setProp: (key: string, value: string) => void;
  settingsEditable: boolean;
}) {
  return (
    <fieldset disabled={!settingsEditable} className="settings-fieldset">
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="PvP" hint="Player versus player">
            <BoolSelect
              id="pvp"
              value={bool(props.pvp, true)}
              onChange={(v) => setProp("pvp", v)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Allow flight" hint="Creative-style flight in survival">
            <BoolSelect
              id="allow-flight"
              value={bool(props["allow-flight"])}
              onChange={(v) => setProp("allow-flight", v)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Spawn protection" hint="Blocks around spawn (0 = off)">
            <Form.Control
              type="number"
              min={0}
              value={props["spawn-protection"] ?? "16"}
              onChange={(e) => setProp("spawn-protection", e.target.value)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Player idle timeout (min)" hint="0 = disabled">
            <Form.Control
              type="number"
              min={0}
              value={props["player-idle-timeout"] ?? "0"}
              onChange={(e) => setProp("player-idle-timeout", e.target.value)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Spawn monsters" hint="Hostile mobs">
            <BoolSelect
              id="spawn-monsters"
              value={bool(props["spawn-monsters"], true)}
              onChange={(v) => setProp("spawn-monsters", v)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Spawn animals" hint="Passive mobs">
            <BoolSelect
              id="spawn-animals"
              value={bool(props["spawn-animals"], true)}
              onChange={(v) => setProp("spawn-animals", v)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Spawn NPCs" hint="Villagers">
            <BoolSelect
              id="spawn-npcs"
              value={bool(props["spawn-npcs"], true)}
              onChange={(v) => setProp("spawn-npcs", v)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Command blocks" hint="Enable command blocks">
            <BoolSelect
              id="enable-command-block"
              value={bool(props["enable-command-block"])}
              onChange={(v) => setProp("enable-command-block", v)}
            />
          </Field>
        </Col>
      </Row>
    </fieldset>
  );
}
