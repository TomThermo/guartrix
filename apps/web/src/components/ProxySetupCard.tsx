import { useEffect, useState } from "react";
import type { McServer } from "@msm/shared";
import { Alert, Button, Form, ListGroup, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";

interface Props {
  server: McServer;
  disabled?: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
  onApplied?: () => void;
}

export function ProxySetupCard({
  server,
  disabled,
  onNotice,
  onError,
  onApplied,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<Awaited<
    ReturnType<typeof api.getProxySetup>
  > | null>(null);

  async function refresh() {
    const next = await api.getProxySetup(server.id);
    setSetup(next);
  }

  useEffect(() => {
    void refresh().catch(() => setSetup(null));
  }, [server.id]);

  async function apply(mode: "none" | "velocity" | "bungeecord") {
    setBusy(true);
    onError(null);
    try {
      const next = await api.applyProxySetup(server.id, mode);
      setSetup(next);
      onNotice(
        mode === "none"
          ? "Proxy mode cleared (online-mode restored)."
          : `Configured for ${mode}. Restart the server to apply.`,
      );
      onApplied?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Proxy setup failed");
    } finally {
      setBusy(false);
    }
  }

  if (!setup) {
    return (
      <Alert variant="light" className="border mb-3">
        <Spinner size="sm" className="me-2" />
        Loading proxy helpers…
      </Alert>
    );
  }

  if (!setup.supported) {
    return (
      <Alert variant="light" className="border mb-3">
        <div className="fw-semibold mb-1">
          <i className="fa-solid fa-network-wired me-2" />
          Behind a proxy
        </div>
        <p className="small text-secondary mb-0">
          Velocity / Bungee helpers are available for Paper and Purpur. Set{" "}
          <code>online-mode=false</code> manually if you use a proxy with other
          loaders.
        </p>
      </Alert>
    );
  }

  return (
    <Alert variant="light" className="border mb-3">
      <div className="fw-semibold mb-1">
        <i className="fa-solid fa-network-wired me-2" />
        Behind a proxy (Velocity / BungeeCord)
      </div>
      <p className="small text-secondary mb-2">
        Applies <code>online-mode=false</code> and the correct forwarding flags.
        Put the same secret in your Velocity <code>forwarding.secret</code>.
        Restart after applying.
      </p>
      <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
        <Button
          size="sm"
          variant={setup.mode === "velocity" ? "primary" : "outline-primary"}
          disabled={disabled || busy}
          onClick={() => void apply("velocity")}
        >
          Velocity
        </Button>
        <Button
          size="sm"
          variant={setup.mode === "bungeecord" ? "primary" : "outline-primary"}
          disabled={disabled || busy}
          onClick={() => void apply("bungeecord")}
        >
          BungeeCord
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={disabled || busy}
          onClick={() => void apply("none")}
        >
          Disable proxy mode
        </Button>
      </Stack>
      <ListGroup variant="flush" className="small mb-2">
        {setup.checklist.map((item) => (
          <ListGroup.Item key={item.id} className="px-0 py-1 bg-transparent">
            <i
              className={`fa-solid ${item.ok ? "fa-check text-success" : "fa-xmark text-danger"} me-2`}
            />
            {item.label}
          </ListGroup.Item>
        ))}
      </ListGroup>
      {setup.mode === "velocity" && setup.velocitySecret && (
        <Form.Group>
          <Form.Label className="small mb-1">Velocity forwarding secret</Form.Label>
          <Form.Control
            size="sm"
            readOnly
            className="font-monospace"
            value={setup.velocitySecret}
            onFocus={(e) => e.currentTarget.select()}
          />
        </Form.Group>
      )}
    </Alert>
  );
}
