import type {
  ServerDetail,
  StartupPreset,
  StartupHeapCheck,
  ServerExtraMount,
} from "@msm/shared";
import {
  DEFAULT_SERVER_JAR,
  JAVA_VERSIONS,
  normalizeJavaVersion,
  type JavaVersion,
} from "@msm/shared";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
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
  isForgeType: boolean;
  jarOk: boolean;
  startupPresets: StartupPreset[];
  resolvedStartupPreview: string;
  heapCheck: StartupHeapCheck;
  memoryMb: number;
}) {
  function updateMount(index: number, patch: Partial<ServerExtraMount>) {
    setExtraMounts(
      extraMounts.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
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
          Manage the startup command and Java version for this server.
          Placeholders: <code>{"{{MEMORY}}"}</code> (RAM in MB)
          {!isForgeType ? (
            <>
              , <code>{"{{JAR}}"}</code> (default <code>server.jar</code>)
            </>
          ) : null}
          . Restart the server to apply changes.
          {isForgeType ? (
            <div className="mt-2 mb-0">
              Forge/NeoForge starts with <code>run.sh</code>. JVM flags from the
              template are written to <code>user_jvm_args.txt</code> (
              <code>-jar</code> / <code>nogui</code> are ignored).
            </div>
          ) : null}
        </Alert>

        <Row className="g-3 mb-3">
          <Col md={6}>
            <Field
              label="Java version"
              hint="Java runtime used when this server starts"
            >
              <Form.Select
                value={javaVersion}
                onChange={(e) =>
                  setJavaVersion(normalizeJavaVersion(e.target.value))
                }
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
            <Field
              label="Server Jar File"
              hint="Jar filename in the server directory (e.g. server.jar or paper-1.21.jar)"
            >
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
                Must end with .jar (letters, digits, . _ - only)
              </Form.Control.Feedback>
            </Field>
          </Col>
        </Row>

        <Field
          label={isForgeType ? "JVM args template" : "Startup command"}
          hint={
            isForgeType
              ? "Flags only; written to user_jvm_args.txt on start"
              : "Command used to start the server. {{JAR}} is replaced by Server Jar File."
          }
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
          {server.type === "PAPER" || server.type === "PURPUR"
            ? "Presets for Paper/Purpur: Default or Aikar’s G1GC."
            : server.type === "VANILLA"
              ? "Presets for Vanilla: Default or Performance (G1GC)."
              : server.type === "FABRIC" || server.type === "QUILT"
                ? "Presets for Fabric/Quilt: Default or Modded G1GC."
                : isForgeType
                  ? "Presets for Forge/NeoForge: Default or Modded G1GC → user_jvm_args.txt."
                  : "Click a preset to fill the command, then Save."}{" "}
          Click to fill, then Save.
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {startupPresets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={
                startupCommand.trim() === preset.command.trim()
                  ? "secondary"
                  : "outline-secondary"
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
          {isForgeType
            ? "Resolved JVM args (preview → user_jvm_args.txt)"
            : "Resolved command (preview)"}
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
          <code>-Xmx</code> / <code>-Xms</code> cannot exceed allocated RAM (
          {memoryMb} MB). Prefer <code>{"{{MEMORY}}"}</code>.
        </Form.Text>
      </fieldset>

      <div className="mt-4 pt-3 border-top">
        <fieldset
          disabled={!settingsEditable}
          className="settings-fieldset border-0 p-0"
        >
          <h3 className="h6 mb-2">Extra host mounts</h3>
          <Alert variant="light" className="border small mb-3">
            Bind shared host directories into the container (e.g. shared plugins).
            Host paths must be under the panel allowlist (default{" "}
            <code>/var/lib/guartrix/shared</code> or{" "}
            <code>/opt/guartrix/shared</code>). Mounts apply on the next
            start/restart. Container path <code>/data</code> is reserved.
          </Alert>

          {extraMounts.length === 0 ? (
            <p className="small text-secondary mb-3">No extra mounts configured.</p>
          ) : (
            <div className="d-flex flex-column gap-3 mb-3">
              {extraMounts.map((m, i) => (
                <div key={i} className="border rounded p-3 bg-body-tertiary">
                  <Row className="g-2 align-items-end">
                    <Col md={5}>
                      <Field label="Host path" hint="Absolute path on the node">
                        <Form.Control
                          className="font-monospace small"
                          value={m.host}
                          onChange={(e) =>
                            updateMount(i, { host: e.target.value })
                          }
                          placeholder="/var/lib/guartrix/shared/plugins"
                          disabled={!settingsEditable}
                        />
                      </Field>
                    </Col>
                    <Col md={4}>
                      <Field
                        label="Container path"
                        hint="Absolute path inside the container"
                      >
                        <Form.Control
                          className="font-monospace small"
                          value={m.container}
                          onChange={(e) =>
                            updateMount(i, { container: e.target.value })
                          }
                          placeholder="/plugins-shared"
                          disabled={!settingsEditable}
                        />
                      </Field>
                    </Col>
                    <Col md={2}>
                      <Form.Check
                        type="checkbox"
                        id={`extra-mount-ro-${i}`}
                        label="Read-only"
                        checked={m.readOnly === true}
                        onChange={(e) =>
                          updateMount(i, { readOnly: e.target.checked })
                        }
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
                        aria-label="Remove mount"
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
            Add mount
            {extraMounts.length > 0
              ? ` (${extraMounts.length}/${MAX_MOUNTS})`
              : ""}
          </Button>
        </fieldset>
      </div>
    </>
  );
}
