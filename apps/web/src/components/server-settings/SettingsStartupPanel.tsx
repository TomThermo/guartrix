import type { ServerDetail, StartupPreset, StartupHeapCheck } from "@msm/shared";
import {
  DEFAULT_SERVER_JAR,
  JAVA_VERSIONS,
  normalizeJavaVersion,
  type JavaVersion,
} from "@msm/shared";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { Field } from "./settings-fields";

export function SettingsStartupPanel({
  server,
  javaVersion,
  setJavaVersion,
  serverJar,
  setServerJar,
  startupCommand,
  setStartupCommand,
  startupEditable,
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
  isForgeType: boolean;
  jarOk: boolean;
  startupPresets: StartupPreset[];
  resolvedStartupPreview: string;
  heapCheck: StartupHeapCheck;
  memoryMb: number;
}) {
  return (
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
  );
}
