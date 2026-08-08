import type { FormEvent, RefObject } from "react";
import { Alert, Button, Col, Form, Row, Spinner, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { copyText } from "../../utils";

export type InstallInfo = {
  nodeId: string;
  token: string;
  publicUrl: string;
  envFile: string;
  installCommand: string;
  steps: string[];
};

export type InstallStepProps = {
  busy: boolean;
  install: InstallInfo | null;
  existingNodeHasHostKey: boolean;
  sshHost: string;
  onSshHostChange: (value: string) => void;
  sshPort: number;
  onSshPortChange: (value: number) => void;
  sshUser: string;
  onSshUserChange: (value: string) => void;
  sshPassword: string;
  onSshPasswordChange: (value: string) => void;
  sshKey: string;
  onSshKeyChange: (value: string) => void;
  panelPassword: string;
  onPanelPasswordChange: (value: string) => void;
  trustHostKey: boolean;
  onTrustHostKeyChange: (value: boolean) => void;
  replaceHostKey: boolean;
  onReplaceHostKeyChange: (value: boolean) => void;
  hostKeyFingerprint: string | null;
  hostKeyNeedsTrust: boolean;
  hostKeyMismatch: boolean;
  log: string;
  logRef: RefObject<HTMLPreElement | null>;
  onSubmit: (e: FormEvent) => void;
  onTrustAndContinue: (e: FormEvent) => void;
  onReplaceAndContinue: (e: FormEvent) => void;
};

export function InstallStep({
  busy,
  install,
  existingNodeHasHostKey,
  sshHost,
  onSshHostChange,
  sshPort,
  onSshPortChange,
  sshUser,
  onSshUserChange,
  sshPassword,
  onSshPasswordChange,
  sshKey,
  onSshKeyChange,
  panelPassword,
  onPanelPasswordChange,
  trustHostKey,
  onTrustHostKeyChange,
  replaceHostKey,
  onReplaceHostKeyChange,
  hostKeyFingerprint,
  hostKeyNeedsTrust,
  hostKeyMismatch,
  log,
  logRef,
  onSubmit,
  onTrustAndContinue,
  onReplaceAndContinue,
}: InstallStepProps) {
  const { t } = useI18n();
  const authOk = Boolean(panelPassword.trim() && (sshPassword || sshKey.trim()));

  return (
    <div>
      {busy && !install && (
        <div className="text-center py-4">
          <Spinner animation="border" />
        </div>
      )}
      {install && (
        <>
          <p className="small text-secondary mb-2">
            {t("admin.sshPanelReachesNode")}{" "}
            <code className="user-select-all">{install.publicUrl}</code>
          </p>
          <Form
            onSubmit={
              hostKeyMismatch
                ? onReplaceAndContinue
                : hostKeyNeedsTrust
                  ? onTrustAndContinue
                  : onSubmit
            }
            className="mb-3"
          >
            <Row className="g-2">
              <Col md={5}>
                <Form.Group>
                  <Form.Label>{t("admin.sshHost")}</Form.Label>
                  <Form.Control
                    value={sshHost}
                    onChange={(e) => onSshHostChange(e.target.value)}
                    required
                    disabled={busy}
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Form.Group>
                  <Form.Label>{t("admin.sshPort")}</Form.Label>
                  <Form.Control
                    type="number"
                    value={sshPort}
                    onChange={(e) => onSshPortChange(Number(e.target.value) || 22)}
                    disabled={busy}
                  />
                </Form.Group>
              </Col>
              <Col md={5}>
                <Form.Group>
                  <Form.Label>{t("admin.sshUsername")}</Form.Label>
                  <Form.Control
                    value={sshUser}
                    onChange={(e) => onSshUserChange(e.target.value)}
                    placeholder="ubuntu"
                    required
                    disabled={busy}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>{t("admin.sshPassword")}</Form.Label>
                  <Form.Control
                    type="password"
                    value={sshPassword}
                    onChange={(e) => onSshPasswordChange(e.target.value)}
                    autoComplete="new-password"
                    placeholder={t("admin.sshPasswordPlaceholder")}
                    disabled={busy}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>{t("admin.sshPrivateKey")}</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={sshKey}
                    onChange={(e) => onSshKeyChange(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    className="font-monospace small"
                    disabled={busy}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label>{t("admin.sshPanelPassword")}</Form.Label>
                  <Form.Control
                    type="password"
                    value={panelPassword}
                    onChange={(e) => onPanelPasswordChange(e.target.value)}
                    autoComplete="current-password"
                    placeholder={t("admin.sshPanelPasswordPlaceholder")}
                    required
                    disabled={busy}
                  />
                  <Form.Text className="text-secondary">
                    {t("admin.sshPanelPasswordHint")}
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
            <Form.Text className="text-secondary d-block mb-2">
              {t("admin.sshInstallHint")}
            </Form.Text>

            {hostKeyNeedsTrust && !hostKeyMismatch && (
              <Alert variant="warning" className="py-2 small">
                <div className="fw-semibold mb-1">{t("admin.sshHostKeyConfirmTitle")}</div>
                <div className="mb-2">{t("admin.sshHostKeyConfirmBody")}</div>
                {hostKeyFingerprint && (
                  <code className="d-block user-select-all mb-2">{hostKeyFingerprint}</code>
                )}
                <Form.Check
                  className="mb-2"
                  type="checkbox"
                  id="trust-host-key"
                  checked={trustHostKey}
                  disabled={busy}
                  onChange={(e) => onTrustHostKeyChange(e.target.checked)}
                  label={t("admin.sshTrustHostKey")}
                />
              </Alert>
            )}

            {hostKeyMismatch && (
              <Alert variant="danger" className="py-2 small">
                <div className="fw-semibold mb-1">{t("admin.sshHostKeyMismatchTitle")}</div>
                <div className="mb-2">{t("admin.sshHostKeyMismatchBody")}</div>
                {hostKeyFingerprint && (
                  <code className="d-block user-select-all mb-2">{hostKeyFingerprint}</code>
                )}
                <Form.Check
                  className="mb-0"
                  type="checkbox"
                  id="replace-host-key"
                  checked={replaceHostKey}
                  disabled={busy}
                  onChange={(e) => onReplaceHostKeyChange(e.target.checked)}
                  label={t("admin.sshReplaceHostKey")}
                />
              </Alert>
            )}

            {!hostKeyNeedsTrust &&
              !hostKeyMismatch &&
              hostKeyFingerprint &&
              !existingNodeHasHostKey && (
                <Alert variant="secondary" className="py-2 small font-monospace">
                  {t("admin.sshHostKeyLabel")}: {hostKeyFingerprint}
                </Alert>
              )}

            {!hostKeyMismatch &&
              !hostKeyNeedsTrust &&
              !!hostKeyFingerprint &&
              !existingNodeHasHostKey && (
                <Form.Check
                  className="mb-2"
                  type="checkbox"
                  id="trust-host-key-pre"
                  checked={trustHostKey}
                  disabled={busy}
                  onChange={(e) => onTrustHostKeyChange(e.target.checked)}
                  label={t("admin.sshTrustHostKey")}
                />
              )}

            <Button
              type="submit"
              variant={hostKeyMismatch ? "warning" : "success"}
              disabled={
                busy ||
                !authOk ||
                (hostKeyNeedsTrust && !trustHostKey) ||
                (hostKeyMismatch && !replaceHostKey)
              }
            >
              {busy ? (
                <>
                  <Spinner size="sm" className="me-2" /> {t("admin.sshInstalling")}
                </>
              ) : hostKeyMismatch ? (
                <>
                  <i className="fa-solid fa-key me-2" />
                  {t("admin.sshReplaceAndInstall")}
                </>
              ) : hostKeyNeedsTrust ? (
                <>
                  <i className="fa-solid fa-shield-halved me-2" />
                  {t("admin.sshTrustAndInstall")}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-up me-2" />
                  {t("admin.sshInstallViaSsh")}
                </>
              )}
            </Button>
          </Form>

          <div className="small text-secondary mb-1">{t("admin.sshLiveFeedback")}</div>
          <pre
            ref={logRef}
            className="bg-dark text-light p-3 rounded small mb-3"
            style={{
              maxHeight: 260,
              overflow: "auto",
              minHeight: 120,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {log || (busy ? t("admin.sshWaitingOutput") : t("admin.sshNoOutputYet"))}
          </pre>

          <details>
            <summary className="small text-secondary">{t("admin.sshManualInstall")}</summary>
            <pre className="bg-dark text-light p-2 rounded small mt-2 user-select-all">
              {install.installCommand}
            </pre>
            <Stack direction="horizontal" gap={2} className="flex-wrap mt-2">
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => void copyText(install.installCommand)}
              >
                {t("admin.sshCopyCommand")}
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => void copyText(install.envFile)}
              >
                {t("admin.sshCopyEnv")}
              </Button>
            </Stack>
          </details>
        </>
      )}
    </div>
  );
}
