import type { ConnectInfo, ServerDetail, ServerProperties } from "@guartrix/shared";
import { Alert, Button, Col, Form, Row, Stack } from "react-bootstrap";
import { api } from "../../api";
import { ProxySetupCard } from "../ProxySetupCard";
import { BoolSelect, Field, bool } from "./settings-fields";

export type PackInfo = {
  hasPack: boolean;
  sizeBytes: number;
  sha1: string | null;
  publicUrl: string;
  resourcePackUrl: string;
} | null;

export function SettingsNetworkPanel({
  server,
  props,
  setProp,
  settingsEditable,
  packInfo,
  packBusy,
  onUploadPack,
  onDeletePack,
  onNotice,
  onError,
  onSaved,
  setConnect,
}: {
  server: ServerDetail;
  props: ServerProperties;
  setProp: (key: string, value: string) => void;
  settingsEditable: boolean;
  packInfo: PackInfo;
  packBusy: boolean;
  onUploadPack: (file: File | null) => void;
  onDeletePack: () => void;
  onNotice?: (message: string | null) => void;
  onError: (message: string | null) => void;
  onSaved: (server: ServerDetail) => void;
  setConnect: (info: ConnectInfo | null) => void;
}) {
  return (
    <fieldset disabled={!settingsEditable} className="settings-fieldset">
      <ProxySetupCard
        server={server}
        disabled={!settingsEditable}
        onNotice={(m) => onNotice?.(m)}
        onError={onError}
        onApplied={() => {
          void api
            .getServer(server.id)
            .then(onSaved)
            .catch(() => undefined);
          void api
            .getConnectInfo(server.id)
            .then(setConnect)
            .catch(() => undefined);
        }}
      />
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Prevent proxy connections" hint="Block VPNs / proxies">
            <BoolSelect
              id="prevent-proxy-connections"
              value={bool(props["prevent-proxy-connections"])}
              onChange={(v) => setProp("prevent-proxy-connections", v)}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Require resource pack" hint="Kick if pack declined">
            <BoolSelect
              id="require-resource-pack"
              value={bool(props["require-resource-pack"])}
              onChange={(v) => setProp("require-resource-pack", v)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Resource pack URL" hint="https://…">
            <Form.Control
              value={props["resource-pack"] ?? ""}
              onChange={(e) => setProp("resource-pack", e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Resource pack SHA-1" hint="Optional hash">
            <Form.Control
              value={props["resource-pack-sha1"] ?? ""}
              onChange={(e) => setProp("resource-pack-sha1", e.target.value)}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={12}>
          <Field label="Resource pack prompt" hint="Message shown to players">
            <Form.Control
              value={props["resource-pack-prompt"] ?? ""}
              onChange={(e) => setProp("resource-pack-prompt", e.target.value)}
            />
          </Field>
        </Col>
      </Row>

      <Alert variant="light" className="border mb-3">
        <div className="fw-semibold mb-2">
          <i className="fa-solid fa-box-open me-2" />
          Upload resource pack
        </div>
        <p className="small text-secondary mb-2">
          Upload a <code>.zip</code> pack. Guartrix hosts it and sets URL + SHA-1 automatically.
        </p>
        {packInfo?.hasPack && (
          <div className="small mb-2">
            <div>
              SHA-1: <code className="user-select-all">{packInfo.sha1}</code>
            </div>
            <div className="text-break">
              URL: <code className="user-select-all">{packInfo.publicUrl}</code>
            </div>
            <div className="text-secondary">
              {(packInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB
            </div>
          </div>
        )}
        <Stack direction="horizontal" gap={2} className="flex-wrap">
          {settingsEditable && (
            <>
              <Form.Control
                type="file"
                accept=".zip,application/zip"
                disabled={packBusy}
                style={{ maxWidth: 280 }}
                onChange={(e) => {
                  const input = e.target as HTMLInputElement;
                  const file = input.files?.[0] ?? null;
                  void onUploadPack(file);
                  input.value = "";
                }}
              />
              {packInfo?.hasPack && (
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={packBusy}
                  onClick={() => void onDeletePack()}
                >
                  Delete pack
                </Button>
              )}
            </>
          )}
        </Stack>
      </Alert>

      <p className="small text-secondary mb-3">
        Manage whitelist players under <strong>Whitelist Manager</strong> in the side menu.
      </p>
    </fieldset>
  );
}
