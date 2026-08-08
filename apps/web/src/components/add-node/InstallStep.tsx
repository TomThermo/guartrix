import type { FormEvent, RefObject } from "react";
import { Alert, Button, Col, Form, Row, Spinner, Stack } from "react-bootstrap";
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
}: InstallStepProps) {
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
            Panel reaches this node at <code className="user-select-all">{install.publicUrl}</code>
          </p>
          <Form onSubmit={onSubmit} className="mb-3">
            <Row className="g-2">
              <Col md={5}>
                <Form.Group>
                  <Form.Label>SSH host</Form.Label>
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
                  <Form.Label>Port</Form.Label>
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
                  <Form.Label>Username</Form.Label>
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
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={sshPassword}
                    onChange={(e) => onSshPasswordChange(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Ubuntu / root password"
                    disabled={busy}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Private key (optional)</Form.Label>
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
                  <Form.Label>Panel password</Form.Label>
                  <Form.Control
                    type="password"
                    value={panelPassword}
                    onChange={(e) => onPanelPasswordChange(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Your Guartrix admin password"
                    required
                    disabled={busy}
                  />
                  <Form.Text className="text-secondary">
                    Confirms this install — a stolen session alone cannot remote-install.
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
            <Form.Text className="text-secondary d-block mb-2">
              Password or key is enough. For key + passphrase, fill in both. The first SSH attempt
              shows the host-key fingerprint; confirm it, then enable trust and install again (MITM
              protection).
            </Form.Text>
            {hostKeyFingerprint && (
              <Alert variant="secondary" className="py-2 small font-monospace">
                Host key: {hostKeyFingerprint}
              </Alert>
            )}
            {!hostKeyMismatch &&
              (hostKeyNeedsTrust || (!!hostKeyFingerprint && !existingNodeHasHostKey)) && (
                <Form.Check
                  className="mb-2"
                  type="checkbox"
                  id="trust-host-key"
                  checked={trustHostKey}
                  disabled={busy}
                  onChange={(e) => onTrustHostKeyChange(e.target.checked)}
                  label="Trust this host key and store it on the node"
                />
              )}
            {hostKeyMismatch && (
              <Form.Check
                className="mb-2"
                type="checkbox"
                id="replace-host-key"
                checked={replaceHostKey}
                disabled={busy}
                onChange={(e) => onReplaceHostKeyChange(e.target.checked)}
                label="Replace stored host key (only after verifying the VPS was rebuilt)"
              />
            )}
            <Button
              type="submit"
              variant="success"
              disabled={
                busy ||
                !panelPassword.trim() ||
                (!sshPassword && !sshKey.trim()) ||
                (hostKeyNeedsTrust && !trustHostKey) ||
                (hostKeyMismatch && !replaceHostKey)
              }
            >
              {busy ? (
                <>
                  <Spinner size="sm" className="me-2" /> Installing on VPS…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-up me-2" />
                  Install via SSH
                </>
              )}
            </Button>
          </Form>

          <div className="small text-secondary mb-1">Live feedback from the remote server</div>
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
            {log || (busy ? "Waiting for output…" : "No output yet — start the install.")}
          </pre>

          <details>
            <summary className="small text-secondary">Manual: download-then-run install</summary>
            <pre className="bg-dark text-light p-2 rounded small mt-2 user-select-all">
              {install.installCommand}
            </pre>
            <Stack direction="horizontal" gap={2} className="flex-wrap mt-2">
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => void copyText(install.installCommand)}
              >
                Copy command
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => void copyText(install.envFile)}
              >
                Copy daemon.env
              </Button>
            </Stack>
          </details>
        </>
      )}
    </div>
  );
}
