import type { ServerDetail, ServerProperties } from "@msm/shared";
import { Alert, Col, Form, Row } from "react-bootstrap";
import { WorldToolsCard } from "../WorldToolsCard";
import { BoolSelect, Field, bool } from "./settings-fields";

export function SettingsWorldPanel({
  server,
  props,
  setProp,
  settingsEditable,
  onNotice,
  onError,
}: {
  server: ServerDetail;
  props: ServerProperties;
  setProp: (key: string, value: string) => void;
  settingsEditable: boolean;
  onNotice?: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  return (
    <fieldset disabled={!settingsEditable} className="settings-fieldset">
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Level name" hint="World folder name">
            <Form.Control
              value={props["level-name"] ?? "world"}
              onChange={(e) => setProp("level-name", e.target.value)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Level type" hint="minecraft:normal, flat, large_biomes…">
            <Form.Control
              value={props["level-type"] ?? "minecraft:normal"}
              onChange={(e) => setProp("level-type", e.target.value)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Seed" hint="Empty = random on first start">
            <Form.Control
              value={props["level-seed"] ?? ""}
              onChange={(e) => setProp("level-seed", e.target.value)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Max world size" hint="Blocks from center">
            <Form.Control
              type="number"
              value={props["max-world-size"] ?? "29999984"}
              onChange={(e) => setProp("max-world-size", e.target.value)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Difficulty" hint="Peaceful to Hard">
            <Form.Select
              value={props.difficulty ?? "easy"}
              onChange={(e) => setProp("difficulty", e.target.value)}
            >
              <option value="peaceful">Peaceful</option>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </Form.Select>
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Default gamemode" hint="New players">
            <Form.Select
              value={props.gamemode ?? "survival"}
              onChange={(e) => setProp("gamemode", e.target.value)}
            >
              <option value="survival">Survival</option>
              <option value="creative">Creative</option>
              <option value="adventure">Adventure</option>
              <option value="spectator">Spectator</option>
            </Form.Select>
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Hardcore" hint="One life, bans on death">
            <BoolSelect
              id="hardcore"
              value={bool(props.hardcore)}
              onChange={(v) => setProp("hardcore", v)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Force gamemode" hint="Always use default gamemode">
            <BoolSelect
              id="force-gamemode"
              value={bool(props["force-gamemode"])}
              onChange={(v) => setProp("force-gamemode", v)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Generate structures" hint="Villages, strongholds…">
            <BoolSelect
              id="generate-structures"
              value={bool(props["generate-structures"], true)}
              onChange={(v) => setProp("generate-structures", v)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Allow Nether" hint="Nether dimension portals">
            <BoolSelect
              id="allow-nether"
              value={bool(props["allow-nether"], true)}
              onChange={(v) => setProp("allow-nether", v)}
            />
          </Field>
        </Col>
      </Row>
      <WorldToolsCard
        server={server}
        canEdit={settingsEditable}
        onNotice={(m) => onNotice?.(m)}
        onError={onError}
      />
      <Alert variant="light" className="border mt-3 mb-0 small">
        <i className="fa-solid fa-map-location-dot me-2" />
        Biome / structure map: open the <strong>World Map</strong> tab in the server menu.
      </Alert>
    </fieldset>
  );
}
