import { Form, Spinner } from "react-bootstrap";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import type { ProfileSectionState } from "./useProfileSection";

type Props = Pick<
  ProfileSectionState,
  | "t"
  | "profile"
  | "displayName"
  | "setDisplayName"
  | "email"
  | "emailStatus"
  | "emailFeedback"
  | "onEmailChange"
>;

export function ProfileIdentityCard({
  t,
  profile,
  displayName,
  setDisplayName,
  email,
  emailStatus,
  emailFeedback,
  onEmailChange,
}: Props) {
  return (
    <AdminPanelCard title={t("account.profileIdentity")} icon="fa-id-card">
      <p className="text-secondary small mb-3">{t("account.profileIdentityHelp")}</p>
      <Form.Group className="mb-3" controlId="profile-username">
        <Form.Label>{t("account.profileUsername")}</Form.Label>
        <Form.Control value={profile?.username ?? ""} disabled readOnly />
      </Form.Group>
      <Form.Group className="mb-3" controlId="profile-display-name">
        <Form.Label>{t("account.profileDisplayName")}</Form.Label>
        <Form.Control
          value={displayName}
          maxLength={120}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("account.profileDisplayNamePlaceholder")}
          autoComplete="name"
        />
      </Form.Group>
      <Form.Group className="mb-2" controlId="profile-email">
        <Form.Label>{t("account.profileEmail")}</Form.Label>
        <Form.Control
          type="email"
          value={email}
          maxLength={254}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          isInvalid={emailStatus === "taken" || emailStatus === "invalid"}
          isValid={emailStatus === "ok"}
        />
        <Form.Text
          className={
            emailStatus === "taken" || emailStatus === "invalid"
              ? "text-danger"
              : emailStatus === "ok"
                ? "text-success"
                : "text-secondary"
          }
        >
          {emailStatus === "checking" && <Spinner size="sm" className="me-1" />}
          {emailFeedback}
        </Form.Text>
      </Form.Group>
    </AdminPanelCard>
  );
}
