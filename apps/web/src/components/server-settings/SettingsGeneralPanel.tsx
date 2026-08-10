import type { AuthUser, ConnectInfo, ServerDetail, ServerProperties } from "@guartrix/shared";
import { useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { copyText } from "../../utils";
import { ServerIconModal } from "../ServerIconModal";
import { BoolSelect, Field, bool } from "./settings-fields";

export function SettingsGeneralPanel({
  server,
  connect,
  port,
  setPort,
  name,
  setName,
  props,
  setProp,
  autoRestart,
  setAutoRestart,
  startOnBoot,
  setStartOnBoot,
  ownerId,
  setOwnerId,
  users,
  isAdmin,
  settingsEditable,
  startupEditable,
  ownerAlertWebhookUrl,
  setOwnerAlertWebhookUrl,
  ownerAlertEmail,
  setOwnerAlertEmail,
  discordStatusWebhookUrl,
  setDiscordStatusWebhookUrl,
  discordStatusEnabled,
  setDiscordStatusEnabled,
  hasIcon,
  setHasIcon,
  onSaved,
  onError,
  onNotice,
  onCopyAddress,
}: {
  server: ServerDetail;
  connect: ConnectInfo | null;
  port: number;
  setPort: (v: number) => void;
  name: string;
  setName: (v: string) => void;
  props: ServerProperties;
  setProp: (key: string, value: string) => void;
  autoRestart: boolean;
  setAutoRestart: (v: boolean) => void;
  startOnBoot: boolean;
  setStartOnBoot: (v: boolean) => void;
  ownerId: string;
  setOwnerId: (v: string) => void;
  users: AuthUser[];
  isAdmin: boolean;
  settingsEditable: boolean;
  startupEditable: boolean;
  ownerAlertWebhookUrl: string;
  setOwnerAlertWebhookUrl: (v: string) => void;
  ownerAlertEmail: string;
  setOwnerAlertEmail: (v: string) => void;
  discordStatusWebhookUrl: string;
  setDiscordStatusWebhookUrl: (v: string) => void;
  discordStatusEnabled: boolean;
  setDiscordStatusEnabled: (v: boolean) => void;
  hasIcon: boolean;
  setHasIcon: (v: boolean) => void;
  onSaved: (server: ServerDetail) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  onCopyAddress: () => void;
}) {
  const { t } = useI18n();
  const [showIconModal, setShowIconModal] = useState(false);

  return (
    <>
      <Card className="border mb-3">
        <Card.Body className="py-3">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div>
              <div className="fw-semibold mb-1">
                <i className="fa-solid fa-plug me-2" />
                Connect
              </div>
              <div className="font-monospace">{connect?.address ?? `:${port}`}</div>
              {(connect?.motd || props.motd) && (
                <div className="small text-secondary mt-1">MOTD: {connect?.motd || props.motd}</div>
              )}
            </div>
            <Button size="sm" variant="outline-primary" onClick={onCopyAddress}>
              <i className="fa-solid fa-copy me-1" />
              Copy address
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="border mb-3">
        <Card.Body className="py-3">
          <div className="d-flex flex-wrap align-items-center gap-3">
            <img
              className="server-icon-preview"
              src={`/api/servers/${server.id}/icon?t=${hasIcon ? server.updatedAt : "default"}`}
              alt=""
              width={48}
              height={48}
            />
            <div className="min-w-0 flex-grow-1">
              <div className="fw-semibold">{t("serverIcon.title")}</div>
              <p className="small text-secondary mb-0">{t("serverIcon.helpShort")}</p>
            </div>
            {settingsEditable ? (
              <Button size="sm" variant="outline-primary" onClick={() => setShowIconModal(true)}>
                <i className="fa-solid fa-pen me-1" />
                {t("serverIcon.change")}
              </Button>
            ) : (
              <span className="small text-secondary">
                {hasIcon ? t("serverIcon.customSet") : t("serverIcon.defaultSet")}
              </span>
            )}
          </div>
        </Card.Body>
      </Card>

      <ServerIconModal
        show={showIconModal}
        serverId={server.id}
        hasIcon={hasIcon}
        onHide={() => setShowIconModal(false)}
        onChanged={(next) => {
          setHasIcon(next);
          onSaved({ ...server, hasIcon: next, updatedAt: new Date().toISOString() });
        }}
        onError={onError}
        onNotice={onNotice}
      />

      {connect?.sftpEnabled && connect.sftpHost && (
        <Card className="border mb-3">
          <Card.Body className="py-3">
            <div className="fw-semibold mb-1">
              <i className="fa-solid fa-folder-open me-2" />
              SFTP Configuration
            </div>
            <p className="small text-secondary mb-3">
              Account details for SFTP connections to this server&apos;s files. Use{" "}
              <strong>SFTP</strong> (not FTP or FTPS). The password is your panel account password.
            </p>
            <dl className="row small mb-0">
              <dt className="col-sm-3 text-secondary">Host</dt>
              <dd className="col-sm-9">
                <code className="user-select-all">sftp://{connect.sftpHost}</code>
                <Button
                  size="sm"
                  variant="link"
                  className="py-0"
                  onClick={() => void copyText(connect.sftpHost!)}
                >
                  Copy
                </Button>
              </dd>
              <dt className="col-sm-3 text-secondary">Port</dt>
              <dd className="col-sm-9">
                <code className="user-select-all">{connect.sftpPort ?? 2022}</code>
              </dd>
              <dt className="col-sm-3 text-secondary">Username</dt>
              <dd className="col-sm-9">
                <code className="user-select-all">{connect.sftpUsername}</code>
                <Button
                  size="sm"
                  variant="link"
                  className="py-0"
                  onClick={() => void copyText(connect.sftpUsername ?? "")}
                >
                  Copy
                </Button>
              </dd>
              <dt className="col-sm-3 text-secondary">Password</dt>
              <dd className="col-sm-9 text-secondary">Your Guartrix panel password</dd>
            </dl>
          </Card.Body>
        </Card>
      )}

      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Display name" hint="Shown in Guartrix">
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!settingsEditable}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="MOTD" hint="Message of the day in the multiplayer list">
            <Form.Control
              value={props.motd ?? ""}
              onChange={(e) => setProp("motd", e.target.value)}
              disabled={!settingsEditable}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Max players" hint="Player slots">
            <Form.Control
              type="number"
              min={1}
              max={1000}
              value={props["max-players"] ?? "20"}
              onChange={(e) => setProp("max-players", e.target.value)}
              disabled={!settingsEditable}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Port" hint="Requires stop to change">
            <Form.Control
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={!startupEditable}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Online mode" hint="Verify accounts with Mojang/Microsoft">
            <BoolSelect
              id="online-mode"
              value={bool(props["online-mode"], true)}
              onChange={(v) => setProp("online-mode", v)}
              disabled={!settingsEditable}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Show in server list" hint="Respond to multiplayer pings">
            <BoolSelect
              id="enable-status"
              value={bool(props["enable-status"], true)}
              onChange={(v) => setProp("enable-status", v)}
              disabled={!settingsEditable}
            />
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field label="Hide online players" hint="Hide sample player names in ping">
            <BoolSelect
              id="hide-online-players"
              value={bool(props["hide-online-players"])}
              onChange={(v) => setProp("hide-online-players", v)}
              disabled={!settingsEditable}
            />
          </Field>
        </Col>
        <Col md={6}>
          <Field label="Auto-restart" hint="Restart if the process exits unexpectedly">
            <Form.Select
              value={autoRestart ? "true" : "false"}
              onChange={(e) => setAutoRestart(e.target.value === "true")}
              disabled={!startupEditable}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Form.Select>
          </Field>
        </Col>
      </Row>
      <Row className="g-3 mb-1">
        <Col md={6}>
          <Field
            label="Start on boot"
            hint="After a panel/host restart, start again unless you stopped or killed it yourself"
          >
            <Form.Select
              value={startOnBoot ? "true" : "false"}
              onChange={(e) => setStartOnBoot(e.target.value === "true")}
              disabled={!startupEditable}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </Form.Select>
          </Field>
        </Col>
        <Col md={6}>
          {isAdmin ? (
            <Field label="Owner" hint="Only this user (and admins) can manage the server">
              <Form.Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </Form.Select>
            </Field>
          ) : (
            <Field label="Owner" hint="Account that owns this server">
              <Form.Control value={server.ownerUsername ?? "—"} disabled readOnly />
            </Field>
          )}
        </Col>
      </Row>

      <Card className="border mb-3 mt-3">
        <Card.Body className="py-3">
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-bell me-2" />
            Owner alerts
          </div>
          <p className="small text-secondary mb-3">
            Optional Discord webhook and/or email for crash, OOM, disk-high, offline, and
            backup-failed events on this server.
          </p>
          <Row className="g-3">
            <Col md={6}>
              <Field label="Alert webhook URL" hint="Discord-compatible webhook">
                <Form.Control
                  value={ownerAlertWebhookUrl}
                  onChange={(e) => setOwnerAlertWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/…"
                  disabled={!settingsEditable}
                />
              </Field>
            </Col>
            <Col md={6}>
              <Field label="Alert email" hint="Leave empty to disable">
                <Form.Control
                  type="email"
                  value={ownerAlertEmail}
                  onChange={(e) => setOwnerAlertEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={!settingsEditable}
                />
              </Field>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="border mb-3">
        <Card.Body className="py-3">
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-comments me-2" />
            Discord status
          </div>
          <p className="small text-secondary mb-3">
            Keep one channel message updated with online/offline status and player count (uses a
            webhook — no bot token).
          </p>
          <Row className="g-3">
            <Col md={8}>
              <Field label="Status webhook URL">
                <Form.Control
                  value={discordStatusWebhookUrl}
                  onChange={(e) => setDiscordStatusWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/…"
                  disabled={!settingsEditable}
                />
              </Field>
            </Col>
            <Col md={4}>
              <Field label="Enabled">
                <Form.Select
                  value={discordStatusEnabled ? "true" : "false"}
                  onChange={(e) => setDiscordStatusEnabled(e.target.value === "true")}
                  disabled={!settingsEditable}
                >
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </Form.Select>
              </Field>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </>
  );
}
