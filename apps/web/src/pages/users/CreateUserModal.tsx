import type { FormEvent } from "react";
import type { UserRole } from "@guartrix/shared";
import { roleLabel } from "@guartrix/shared";
import { Button, Form, Modal } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { RamGbSelect } from "../../components/RamGbSelect";
import { roleHintKey, USER_ROLES } from "./useUsersPage";

type Props = {
  show: boolean;
  busy: boolean;
  username: string;
  password: string;
  role: UserRole;
  maxServers: number;
  maxMemoryGb: number;
  maxDatabases: number;
  unlimitedServers: boolean;
  unlimitedRam: boolean;
  unlimitedDatabases: boolean;
  hostMemoryGb: number;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRoleChange: (value: UserRole) => void;
  onMaxServersChange: (value: number) => void;
  onMaxMemoryGbChange: (value: number) => void;
  onMaxDatabasesChange: (value: number) => void;
  onUnlimitedServersChange: (value: boolean) => void;
  onUnlimitedRamChange: (value: boolean) => void;
  onUnlimitedDatabasesChange: (value: boolean) => void;
  onHide: () => void;
  onSubmit: (e: FormEvent) => void;
};

export function CreateUserModal({
  show,
  busy,
  username,
  password,
  role,
  maxServers,
  maxMemoryGb,
  maxDatabases,
  unlimitedServers,
  unlimitedRam,
  unlimitedDatabases,
  hostMemoryGb,
  onUsernameChange,
  onPasswordChange,
  onRoleChange,
  onMaxServersChange,
  onMaxMemoryGbChange,
  onMaxDatabasesChange,
  onUnlimitedServersChange,
  onUnlimitedRamChange,
  onUnlimitedDatabasesChange,
  onHide,
  onSubmit,
}: Props) {
  const { t } = useI18n();

  return (
    <Modal
      show={show}
      onHide={() => {
        if (!busy) onHide();
      }}
      centered
    >
      <Form onSubmit={(e) => void onSubmit(e)}>
        <Modal.Header closeButton>
          <Modal.Title>{t("users.createUser")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3" controlId="new-username">
            <Form.Label>{t("users.username")}</Form.Label>
            <Form.Control
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_\-]+"
              placeholder="steve"
              autoFocus
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="new-password">
            <Form.Label>{t("users.password")}</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
              minLength={12}
            />
            <Form.Text className="text-secondary">{t("users.passwordHelp")}</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3" controlId="new-role">
            <Form.Label>{t("users.role")}</Form.Label>
            <Form.Select value={role} onChange={(e) => onRoleChange(e.target.value as UserRole)}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Form.Select>
            <Form.Text className="text-secondary">{t(roleHintKey(role))}</Form.Text>
          </Form.Group>

          {role !== "ADMIN" && (
            <>
              <Form.Group className="mb-3" controlId="new-max-servers">
                <Form.Label>{t("users.maxServers")}</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  value={maxServers}
                  disabled={unlimitedServers}
                  onChange={(e) => onMaxServersChange(Number(e.target.value))}
                />
                <Form.Check
                  className="mt-2"
                  type="checkbox"
                  id="unlimited-servers"
                  label={t("users.unlimitedServers")}
                  checked={unlimitedServers}
                  onChange={(e) => onUnlimitedServersChange(e.target.checked)}
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="new-max-ram">
                <Form.Label>{t("users.maxRam")}</Form.Label>
                <RamGbSelect
                  id="new-max-ram"
                  valueGb={maxMemoryGb}
                  maxGb={hostMemoryGb}
                  disabled={unlimitedRam}
                  onChangeGb={onMaxMemoryGbChange}
                />
                <Form.Check
                  className="mt-2"
                  type="checkbox"
                  id="unlimited-ram"
                  label={t("users.unlimitedRam")}
                  checked={unlimitedRam}
                  onChange={(e) => onUnlimitedRamChange(e.target.checked)}
                />
                <Form.Text className="text-secondary">
                  {t("users.ramPoolHelp", { gb: hostMemoryGb })}
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-0" controlId="new-max-databases">
                <Form.Label>{t("users.maxDatabases")}</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  value={maxDatabases}
                  disabled={unlimitedDatabases}
                  onChange={(e) => onMaxDatabasesChange(Number(e.target.value))}
                />
                <Form.Check
                  className="mt-2"
                  type="checkbox"
                  id="unlimited-databases"
                  label={t("users.unlimitedDatabases")}
                  checked={unlimitedDatabases}
                  onChange={(e) => onUnlimitedDatabasesChange(e.target.checked)}
                />
                <Form.Text className="text-secondary">{t("users.databasesHelp")}</Form.Text>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={onHide}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("users.creating") : t("users.createUser")}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
