import type { FormEvent } from "react";
import { Button, Form } from "react-bootstrap";
import type { LicenseInfo } from "./licenseShared";

export function LicenseActivateForm({
  keyValue,
  onKeyChange,
  busy,
  onSubmit,
}: {
  keyValue: string;
  onKeyChange: (value: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <section className="license-panel">
      <h2 className="h6 mb-2">Activate key</h2>
      <Form onSubmit={onSubmit}>
        <Form.Control
          className="mb-2 font-monospace"
          size="sm"
          value={keyValue}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder="GTRX-…"
          disabled={busy}
          autoComplete="off"
        />
        <Button type="submit" size="sm" className="w-100" disabled={busy || !keyValue.trim()}>
          Save &amp; validate
        </Button>
      </Form>
    </section>
  );
}

export function LicenseServerForm({
  info,
  serverUrl,
  onServerUrlChange,
  busy,
  onSubmit,
  onReset,
}: {
  info: LicenseInfo;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onReset: () => void;
}) {
  return (
    <section className="license-panel mt-3">
      <h2 className="h6 mb-1">License server</h2>
      <p className="small text-secondary mb-2">
        Source: <code>{info.serverUrlSource}</code>
        {info.serverUrlEnvDefault ? ` · default ${info.serverUrlEnvDefault}` : ""}
      </p>
      <Form onSubmit={onSubmit}>
        <Form.Control
          className="mb-2 font-monospace"
          size="sm"
          value={serverUrl}
          onChange={(e) => onServerUrlChange(e.target.value)}
          placeholder="https://license.guartrix.com"
          disabled={busy}
          autoComplete="off"
        />
        <div className="d-flex gap-2">
          <Button
            type="submit"
            size="sm"
            className="flex-grow-1"
            disabled={busy || !serverUrl.trim()}
          >
            Save &amp; check
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            disabled={busy}
            onClick={onReset}
          >
            Reset
          </Button>
        </div>
      </Form>
    </section>
  );
}
