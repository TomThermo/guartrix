import type { ServerDetail, StartupPreset, StartupHeapCheck, ServerExtraMount } from "@msm/shared";
import {
  DEFAULT_SERVER_JAR,
  JAVA_VERSIONS,
  normalizeJavaVersion,
  type JavaVersion,
} from "@msm/shared";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { Field } from "./settings-fields";

const MAX_MOUNTS = 8;

export function SettingsStartupPanel({
  server,
  javaVersion,
  setJavaVersion,
  serverJar,
  setServerJar,
  startupCommand,
  setStartupCommand,
  startupEditable,
  settingsEditable,
  extraMounts,
  setExtraMounts,
  isAdmin,
  isForgeType,
  jarOk,
  startupPresets,
  resolvedStartupPreview,
  heapCheck,
  memoryMb,
}: {
  server: ServerDetail;
  javaVersion: JavaVersion;
  setJavaVersion: (v: JavaVersion) => void;
  serverJar: string;
  setServerJar: (v: string) => void;
  startupCommand: string;
  setStartupCommand: (v: string) => void;
  startupEditable: boolean;
  settingsEditable: boolean;
  extraMounts: ServerExtraMount[];
  setExtraMounts: (v: ServerExtraMount[]) => void;
  isAdmin: boolean;
  isForgeType: boolean;
  jarOk: boolean;
  startupPresets: StartupPreset[];
  resolvedStartupPreview: string;
  heapCheck: StartupHeapCheck;
  memoryMb: number;
}) {
  const { t } = useI18n();

  function presetBlurb(): string {
    if (server.type === "PAPER" || server.type === "PURPUR") {
      return t("settings.presetsPaperPurpur");
    }
    if (server.type === "VANILLA") return t("settings.presetsVanilla");
    if (server.type === "FABRIC" || server.type === "QUILT") {
      return t("settings.presetsFabricQuilt");
    }
    if (isForgeType) return t("settings.presetsForge");
    return t("settings.presetsGeneric");
  }

  function updateMount(index: number, patch: Partial<ServerExtraMount>) {
    setExtraMounts(extraMounts.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function removeMount(index: number) {
    setExtraMounts(extraMounts.filter((_, i) => i !== index));
  }

  function addMount() {
    if (extraMounts.length >= MAX_MOUNTS) return;
    setExtraMounts([
      ...extraMounts,
      {
        host: "/var/lib/guartrix/shared/",
        container: "/shared",
        readOnly: true,
      },
    ]);
  }

  return (
    <>
      <fieldset disabled={!startupEditable} className="settings-fieldset border-0 p-0">
        <Alert variant="light" className="border small mb-3">
          {t("settings.startupIntro", {
            jarHint: !isForgeType ? t("settings.startupJarHint") : "",
          })}
          {isForgeType ? <div className="mt-2 mb-0">{t("settings.forgeStartupNote")}</div> : null}
        </Alert>

        <Row className="g-3 mb-3">
          <Col md={6}>
            <Field label={t("settings.javaVersion")} hint={t("settings.javaVersionHint")}>
              <Form.Select
                value={javaVersion}
                onChange={(e) => setJavaVersion(normalizeJavaVersion(e.target.value))}
                disabled={!startupEditable}
              >
                {JAVA_VERSIONS.map((j) => (
                  <option key={j.version} value={j.version}>
                    {j.label}
                  </option>
                ))}
              </Form.Select>
            </Field>
          </Col>
          <Col md={6}>
            <Field label={t("settings.serverJar")} hint={t("settings.serverJarHint")}>
              <Form.Control
                className="font-monospace"
                value={serverJar}
                onChange={(e) => setServerJar(e.target.value)}
                placeholder={DEFAULT_SERVER_JAR}
                required
                isInvalid={startupEditable && !jarOk}
                disabled={!startupEditable || isForgeType}
              />
              <Form.Control.Feedback type="invalid">
                {t("settings.serverJarInvalid")}
              </Form.Control.Feedback>
            </Field>
          </Col>
        </Row>

        <Field
          label={isForgeType ? t("settings.jvmArgsTemplate") : t("settings.startupCommand")}
          hint={isForgeType ? t("settings.jvmArgsHint") : t("settings.startupCommandHint")}
        >
          <Form.Control
            as="textarea"
            rows={4}
            className="font-monospace small"
            value={startupCommand}
            onChange={(e) => setStartupCommand(e.target.value)}
            disabled={!startupEditable}
          />
        </Field>

        <div className="small text-secondary mb-2">
          {presetBlurb()} {t("settings.presetsClickSave")}.
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {startupPresets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={
                startupCommand.trim() === preset.command.trim() ? "secondary" : "outline-secondary"
              }
              disabled={!startupEditable}
              title={preset.hint}
              onClick={() => setStartupCommand(preset.command)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="small text-secondary mb-1">
          {isForgeType ? t("settings.resolvedJvmArgs") : t("settings.resolvedCommand")}
        </div>
        <pre className="bg-body-tertiary border rounded p-3 small font-monospace mb-0 text-break">
          {resolvedStartupPreview}
        </pre>
        {!heapCheck.ok && heapCheck.error && (
          <Alert variant="danger" className="small mt-3 mb-0">
            {heapCheck.error}
          </Alert>
        )}
        <Form.Text className="text-secondary d-block mt-2">
          {t("settings.heapLimitHint", { memoryMb })}
        </Form.Text>
      </fieldset>

      {isAdmin && (
        <div className="mt-4 pt-3 border-top">
          <fieldset disabled={!settingsEditable} className="settings-fieldset border-0 p-0">
            <h3 className="h6 mb-2">{t("settings.extraMountsTitle")}</h3>
            <Alert variant="light" className="border small mb-3">
              {t("settings.extraMountsHelp")}
            </Alert>

            {extraMounts.length === 0 ? (
              <p className="small text-secondary mb-3">{t("settings.noExtraMounts")}</p>
            ) : (
              <div className="d-flex flex-column gap-3 mb-3">
                {extraMounts.map((m, i) => (
                  <div key={i} className="border rounded p-3 bg-body-tertiary">
                    <Row className="g-2 align-items-end">
                      <Col md={5}>
                        <Field label={t("settings.hostPath")} hint={t("settings.hostPathHint")}>
                          <Form.Control
                            className="font-monospace small"
                            value={m.host}
                            onChange={(e) => updateMount(i, { host: e.target.value })}
                            placeholder="/var/lib/guartrix/shared/plugins"
                            disabled={!settingsEditable}
                          />
                        </Field>
                      </Col>
                      <Col md={4}>
                        <Field
                          label={t("settings.containerPath")}
                          hint={t("settings.containerPathHint")}
                        >
                          <Form.Control
                            className="font-monospace small"
                            value={m.container}
                            onChange={(e) => updateMount(i, { container: e.target.value })}
                            placeholder="/plugins-shared"
                            disabled={!settingsEditable}
                          />
                        </Field>
                      </Col>
                      <Col md={2}>
                        <Form.Check
                          type="checkbox"
                          id={`extra-mount-ro-${i}`}
                          label={t("settings.readOnly")}
                          checked={m.readOnly === true}
                          onChange={(e) => updateMount(i, { readOnly: e.target.checked })}
                          disabled={!settingsEditable}
                        />
                      </Col>
                      <Col md={1} className="text-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline-danger"
                          disabled={!settingsEditable}
                          onClick={() => removeMount(i)}
                          aria-label={t("settings.removeMount")}
                        >
                          <i className="fa-solid fa-trash" aria-hidden />
                        </Button>
                      </Col>
                    </Row>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline-secondary"
              disabled={!settingsEditable || extraMounts.length >= MAX_MOUNTS}
              onClick={addMount}
            >
              {t("settings.addMount")}
              {extraMounts.length > 0 ? ` (${extraMounts.length}/${MAX_MOUNTS})` : ""}
            </Button>
          </fieldset>
        </div>
      )}
    </>
  );
}
