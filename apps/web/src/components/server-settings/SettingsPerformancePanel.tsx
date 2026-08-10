import type { ServerProperties } from "@guartrix/shared";
import { Col, Form, Row } from "react-bootstrap";
import { MemorySelect } from "../MemorySelect";
import { BoolSelect, Field, bool } from "./settings-fields";

export function SettingsPerformancePanel({
  props,
  setProp,
  memoryMb,
  setMemoryMb,
  diskMb,
  setDiskMb,
  cpuLimit,
  setCpuLimit,
  memoryCapMb,
  isAdmin,
  settingsEditable,
  startupEditable,
}: {
  props: ServerProperties;
  setProp: (key: string, value: string) => void;
  memoryMb: number;
  setMemoryMb: (v: number) => void;
  diskMb: number;
  setDiskMb: (v: number) => void;
  cpuLimit: number;
  setCpuLimit: (v: number) => void;
  memoryCapMb: number | null;
  isAdmin: boolean;
  settingsEditable: boolean;
  startupEditable: boolean;
}) {
  return (
    <>
      {isAdmin ? (
        <fieldset disabled={!startupEditable} className="settings-fieldset border-0 p-0 mb-1">
          <Row className="g-3 mb-1">
            <Col md={6}>
              <Field label="Memory" hint="Java heap (-Xmx). Restart to apply.">
                <MemorySelect
                  valueMb={memoryMb}
                  onChangeMb={setMemoryMb}
                  maxMb={memoryCapMb}
                  disabled={!startupEditable}
                />
              </Field>
            </Col>
            <Col md={6}>
              <Field label="Disk limit" hint="Max storage for this server’s files.">
                <MemorySelect valueMb={diskMb} onChangeMb={setDiskMb} disabled={!startupEditable} />
              </Field>
            </Col>
          </Row>
          <Row className="g-3 mb-1">
            <Col md={6}>
              <Field label="CPU limit" hint="100 = 1 CPU core. Restart to apply.">
                <Form.Select
                  value={cpuLimit}
                  onChange={(e) => setCpuLimit(Number(e.target.value))}
                  disabled={!startupEditable}
                >
                  <option value={0}>Unlimited</option>
                  <option value={50}>0.5 core (50%)</option>
                  <option value={100}>1 core (100%)</option>
                  <option value={200}>2 cores (200%)</option>
                  <option value={400}>4 cores (400%)</option>
                  <option value={800}>8 cores (800%)</option>
                </Form.Select>
              </Field>
            </Col>
          </Row>
        </fieldset>
      ) : null}
      <fieldset disabled={!settingsEditable} className="settings-fieldset border-0 p-0">
        <Row className="g-3 mb-1">
          <Col md={6}>
            <Field label="Sync chunk writes" hint="Safer disk writes">
              <BoolSelect
                id="sync-chunk-writes"
                value={bool(props["sync-chunk-writes"], true)}
                onChange={(v) => setProp("sync-chunk-writes", v)}
              />
            </Field>
          </Col>
        </Row>
        <Row className="g-3 mb-1">
          <Col md={6}>
            <Field label="View distance" hint="Chunks sent to clients">
              <Form.Control
                type="number"
                min={2}
                max={128}
                value={props["view-distance"] ?? "10"}
                onChange={(e) => setProp("view-distance", e.target.value)}
              />
            </Field>
          </Col>
          <Col md={6}>
            <Field label="Simulation distance" hint="Chunks that tick">
              <Form.Control
                type="number"
                min={2}
                max={128}
                value={props["simulation-distance"] ?? "10"}
                onChange={(e) => setProp("simulation-distance", e.target.value)}
              />
            </Field>
          </Col>
        </Row>
        <Row className="g-3 mb-1">
          <Col md={6}>
            <Field label="Network compression" hint="-1 off, 256 default">
              <Form.Control
                type="number"
                value={props["network-compression-threshold"] ?? "256"}
                onChange={(e) => setProp("network-compression-threshold", e.target.value)}
              />
            </Field>
          </Col>
          <Col md={6}>
            <Field label="Max tick time (ms)" hint="-1 disables watchdog">
              <Form.Control
                type="number"
                value={props["max-tick-time"] ?? "60000"}
                onChange={(e) => setProp("max-tick-time", e.target.value)}
              />
            </Field>
          </Col>
        </Row>
      </fieldset>
    </>
  );
}
