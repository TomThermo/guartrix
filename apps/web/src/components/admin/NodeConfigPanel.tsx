import { useCallback, useEffect, useState } from "react";
import type { DaemonNode } from "@msm/shared";
import { Alert, Button, Spinner, Stack } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { copyText } from "../../utils";

type InstallPayload = {
  token: string;
  publicUrl: string;
  envFile: string;
  configPath: string;
  listenPort: number;
  installCommand: string;
  autoDeployCommand?: string;
  steps: string[];
};

export function NodeConfigPanel({
  node,
  active,
  busy,
  onBusy,
  onError,
  onNotice,
  onNewToken,
  onChanged,
  onInstallViaSsh,
}: {
  node: DaemonNode;
  active: boolean;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onNewToken: (token: string) => void;
  onChanged: () => Promise<void>;
  onInstallViaSsh: (node: DaemonNode) => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<InstallPayload | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const markCopied = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setNeedsToken(false);
    onError(null);
    try {
      const res = await api.getNodeInstall(node.id);
      setPayload({
        token: res.token,
        publicUrl: res.publicUrl,
        envFile: res.envFile,
        configPath: res.configPath ?? "/var/lib/guartrix/daemon.env",
        listenPort: res.listenPort ?? node.daemonPort,
        installCommand: res.installCommand,
        autoDeployCommand: res.autoDeployCommand ?? res.installCommand,
        steps: res.steps,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/regenerate|vault|409/i.test(msg)) {
        setNeedsToken(true);
        setPayload(null);
      } else {
        onError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [node.daemonPort, node.id, onError]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  async function onResetToken() {
    if (!confirm(t("admin.nodeResetTokenConfirm"))) return;
    onBusy(node.id);
    onError(null);
    try {
      const res = await api.regenerateNodeToken(node.id);
      onNewToken(res.token);
      onNotice(t("admin.nodeResetTokenNotice"));
      await onChanged();
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(null);
    }
  }

  if (!active) return null;

  if (loading && !payload) {
    return (
      <div className="text-secondary small py-3">
        <Spinner size="sm" className="me-2" />
        {t("admin.nodeConfigLoading")}
      </div>
    );
  }

  if (needsToken) {
    return (
      <Alert variant="warning" className="mb-0">
        <div className="mb-2">{t("admin.nodeConfigNeedsToken")}</div>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void onResetToken()}>
          {t("admin.nodeResetToken")}
        </Button>
      </Alert>
    );
  }

  if (!payload) return null;

  const deployCmd = payload.autoDeployCommand ?? payload.installCommand;

  return (
    <div className="node-config-panel">
      {node.isLocal ? (
        <Alert variant="info" className="py-2 small">
          {t("admin.nodeConfigLocalHint", { path: payload.configPath })}
        </Alert>
      ) : (
        <Alert variant="secondary" className="py-2 small">
          {t("admin.nodeConfigInstructions", { path: payload.configPath })}
        </Alert>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div>
          <div className="fw-semibold">{t("admin.nodeConfigFileTitle")}</div>
          <code className="small user-select-all">{payload.configPath}</code>
        </div>
        <Button
          size="sm"
          variant="outline-primary"
          onClick={() => {
            void copyText(payload.envFile).then(() => markCopied("env"));
          }}
        >
          <i className="fa-solid fa-copy me-1" aria-hidden />
          {copied === "env"
            ? t("common.copied", { label: "daemon.env" })
            : t("admin.nodeCopyConfig")}
        </Button>
      </div>

      <pre className="node-config-pre user-select-all mb-4">{payload.envFile}</pre>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div className="fw-semibold">{t("admin.nodeAutoDeploy")}</div>
        <Button
          size="sm"
          variant="outline-primary"
          onClick={() => {
            void copyText(deployCmd).then(() => markCopied("cmd"));
          }}
        >
          <i className="fa-solid fa-copy me-1" aria-hidden />
          {copied === "cmd" ? t("common.copied", { label: "cmd" }) : t("admin.nodeCopyCommand")}
        </Button>
      </div>
      <p className="small text-secondary mb-2">{t("admin.nodeAutoDeployHint")}</p>
      <pre className="node-config-pre user-select-all mb-4">{deployCmd}</pre>

      <div className="small text-secondary mb-3">
        {t("admin.nodeConfigConnectUrl")}:{" "}
        <code className="user-select-all">{payload.publicUrl}</code>
        {" · "}
        {t("admin.nodeConfigListenPort")}: <code>{payload.listenPort}</code>
      </div>

      <Stack direction="horizontal" gap={2} className="flex-wrap">
        {!node.isLocal && (
          <Button variant="primary" disabled={busy} onClick={() => onInstallViaSsh(node)}>
            <i className="fa-solid fa-download me-2" aria-hidden />
            {t("admin.installDaemon")}
          </Button>
        )}
        <Button variant="outline-secondary" disabled={busy} onClick={() => void onResetToken()}>
          <i className="fa-solid fa-key me-2" aria-hidden />
          {t("admin.nodeResetToken")}
        </Button>
        <Button variant="outline-secondary" disabled={busy || loading} onClick={() => void load()}>
          <i className="fa-solid fa-rotate me-2" aria-hidden />
          {t("common.refresh")}
        </Button>
      </Stack>
    </div>
  );
}
