import type { FormEvent } from "react";
import { Button, Col, Form, Row, Spinner } from "react-bootstrap";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import type { ProfileSectionState } from "./useProfileSection";

type Props = Pick<
  ProfileSectionState,
  | "t"
  | "profile"
  | "pwBusy"
  | "currentPassword"
  | "setCurrentPassword"
  | "newPassword"
  | "setNewPassword"
  | "confirmPassword"
  | "setConfirmPassword"
  | "totpCode"
  | "setTotpCode"
  | "onChangePassword"
>;

export function ChangePasswordCard({
  t,
  profile,
  pwBusy,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  totpCode,
  setTotpCode,
  onChangePassword,
}: Props) {
  return (
    <Form onSubmit={(e: FormEvent) => void onChangePassword(e)} className="mb-4">
      <AdminPanelCard title={t("account.passwordTitle")} icon="fa-key">
        <p className="text-secondary small mb-3">{t("account.passwordHelp")}</p>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="profile-current-password">
              <Form.Label>{t("account.passwordCurrent")}</Form.Label>
              <Form.Control
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Form.Group>
          </Col>
          {profile?.twoFactorEnabled && (
            <Col md={6}>
              <Form.Group controlId="profile-totp">
                <Form.Label>{t("account.passwordTotp")}</Form.Label>
                <Form.Control
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  required
                />
                <Form.Text className="text-secondary">{t("account.passwordTotpHelp")}</Form.Text>
              </Form.Group>
            </Col>
          )}
          <Col md={6}>
            <Form.Group controlId="profile-new-password">
              <Form.Label>{t("account.passwordNew")}</Form.Label>
              <Form.Control
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="profile-confirm-password">
              <Form.Label>{t("account.passwordConfirm")}</Form.Label>
              <Form.Control
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                isInvalid={confirmPassword.length > 0 && confirmPassword !== newPassword}
              />
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <Form.Control.Feedback type="invalid">
                  {t("account.passwordMismatch")}
                </Form.Control.Feedback>
              )}
            </Form.Group>
          </Col>
        </Row>
        <div className="d-flex justify-content-end mt-3">
          <Button
            type="submit"
            variant="outline-primary"
            disabled={
              pwBusy ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              (profile?.twoFactorEnabled === true && !totpCode.trim())
            }
          >
            {pwBusy ? (
              <>
                <Spinner size="sm" className="me-2" />
                {t("common.saving")}
              </>
            ) : (
              t("account.passwordSave")
            )}
          </Button>
        </div>
      </AdminPanelCard>
    </Form>
  );
}
