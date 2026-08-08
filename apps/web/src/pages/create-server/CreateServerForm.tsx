import { Col, Form, Row } from "react-bootstrap";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

export type CreateServerFormProps = {
  worldPreset: "DEFAULT" | "FLAT" | "VOID";
  onWorldPresetChange: (value: "DEFAULT" | "FLAT" | "VOID") => void;
  seed: string;
  onSeedChange: (value: string) => void;
  gamemode: string;
  onGamemodeChange: (value: string) => void;
  difficulty: string;
  onDifficultyChange: (value: string) => void;
};

/** Create-mode world settings (shared fields live in ServerTypeNodeFields). */
export function CreateServerForm({
  worldPreset,
  onWorldPresetChange,
  seed,
  onSeedChange,
  gamemode,
  onGamemodeChange,
  difficulty,
  onDifficultyChange,
}: CreateServerFormProps) {
  const { t } = useI18n();

  return (
    <AdminPanelCard title={t("createServer.sectionWorld")} icon="fa-map">
      <Row className="g-3">
        <Col md={6}>
          <Form.Group controlId="world-preset">
            <Form.Label>{t("createServer.worldPreset")}</Form.Label>
            <Form.Select
              value={worldPreset}
              onChange={(e) => onWorldPresetChange(e.target.value as "DEFAULT" | "FLAT" | "VOID")}
            >
              <option value="DEFAULT">{t("createServer.presetDefault")}</option>
              <option value="FLAT">{t("createServer.presetFlat")}</option>
              <option value="VOID">{t("createServer.presetVoid")}</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="seed">
            <Form.Label>
              {t("createServer.seed")} ({t("common.optional")})
            </Form.Label>
            <Form.Control
              value={seed}
              onChange={(e) => onSeedChange(e.target.value)}
              placeholder={t("createServer.seedPlaceholder")}
              maxLength={128}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="gamemode">
            <Form.Label>{t("createServer.gamemode")}</Form.Label>
            <Form.Select value={gamemode} onChange={(e) => onGamemodeChange(e.target.value)}>
              <option value="survival">{t("createServer.gamemodeSurvival")}</option>
              <option value="creative">{t("createServer.gamemodeCreative")}</option>
              <option value="adventure">{t("createServer.gamemodeAdventure")}</option>
              <option value="spectator">{t("createServer.gamemodeSpectator")}</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="difficulty">
            <Form.Label>{t("createServer.difficulty")}</Form.Label>
            <Form.Select value={difficulty} onChange={(e) => onDifficultyChange(e.target.value)}>
              <option value="peaceful">{t("createServer.difficultyPeaceful")}</option>
              <option value="easy">{t("createServer.difficultyEasy")}</option>
              <option value="normal">{t("createServer.difficultyNormal")}</option>
              <option value="hard">{t("createServer.difficultyHard")}</option>
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>
    </AdminPanelCard>
  );
}
