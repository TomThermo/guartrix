import { useEffect, useState } from "react";
import type { McServer } from "@msm/shared";
import { Alert, Button, Form, ListGroup, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

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
  const { t } = useI18n();
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
          ? t("proxy.clearedNotice")
          : t("proxy.configuredNotice", { mode }),
      );
      onApplied?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("proxy.setupFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!setup) {
    return (
      <Alert variant="light" className="border mb-3">
        <Spinner size="sm" className="me-2" />
        {t("proxy.loading")}
      </Alert>
    );
  }

  if (!setup.supported) {
    return (
      <Alert variant="light" className="border mb-3">
        <div className="fw-semibold mb-1">
          <i className="fa-solid fa-network-wired me-2" />
          {t("proxy.unsupportedTitle")}
        </div>
        <p className="small text-secondary mb-0">{t("proxy.unsupportedBody")}</p>
      </Alert>
    );
  }

  return (
    <Alert variant="light" className="border mb-3">
      <div className="fw-semibold mb-1">
        <i className="fa-solid fa-network-wired me-2" />
        {t("proxy.title")}
      </div>
      <p className="small text-secondary mb-2">{t("proxy.help")}</p>
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
          {t("proxy.disableMode")}
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
          <Form.Label className="small mb-1">{t("proxy.velocitySecret")}</Form.Label>
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
