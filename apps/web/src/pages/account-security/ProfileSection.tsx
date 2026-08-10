import { Button, Col, Form, Row, Spinner } from "react-bootstrap";
import { ChangePasswordCard } from "./ChangePasswordCard";
import { ProfileAddressCard } from "./ProfileAddressCard";
import { ProfileIdentityCard } from "./ProfileIdentityCard";
import { ProfilePhoneCard } from "./ProfilePhoneCard";
import { useProfileSection } from "./useProfileSection";

type Props = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export function ProfileSection({ onNotice, onError }: Props) {
  const s = useProfileSection({ onNotice, onError });

  if (s.loading) {
    return (
      <div className="text-secondary py-4">
        <Spinner size="sm" className="me-2" />
        {s.t("common.loading")}…
      </div>
    );
  }

  return (
    <>
      <Form onSubmit={(e) => void s.onSubmit(e)} className="mb-4">
        <Row className="g-4">
          <Col lg={6}>
            <ProfileIdentityCard
              t={s.t}
              profile={s.profile}
              displayName={s.displayName}
              setDisplayName={s.setDisplayName}
              email={s.email}
              emailStatus={s.emailStatus}
              emailFeedback={s.emailFeedback}
              onEmailChange={s.onEmailChange}
            />
          </Col>

          <Col lg={6}>
            <ProfilePhoneCard
              t={s.t}
              phoneCountry={s.phoneCountry}
              setPhoneCountry={s.setPhoneCountry}
              phoneNational={s.phoneNational}
              setPhoneNational={s.setPhoneNational}
              phoneMeta={s.phoneMeta}
            />
          </Col>

          <Col xs={12}>
            <ProfileAddressCard
              t={s.t}
              suggestQ={s.suggestQ}
              suggestions={s.suggestions}
              suggestBusy={s.suggestBusy}
              runAddressSuggest={s.runAddressSuggest}
              onPickSuggestion={s.onPickSuggestion}
              addressChecked={s.addressChecked}
              addressLine1={s.addressLine1}
              setAddressLine1={s.setAddressLine1}
              addressLine2={s.addressLine2}
              setAddressLine2={s.setAddressLine2}
              addressPostalCode={s.addressPostalCode}
              setAddressPostalCode={s.setAddressPostalCode}
              addressCity={s.addressCity}
              setAddressCity={s.setAddressCity}
              addressCountry={s.addressCountry}
              setAddressCountry={s.setAddressCountry}
              clearAddressVerification={s.clearAddressVerification}
            />
          </Col>
        </Row>

        <div className="d-flex justify-content-end mt-3">
          <Button
            type="submit"
            variant="primary"
            disabled={s.busy || s.emailStatus === "taken" || s.emailStatus === "checking"}
          >
            {s.busy ? (
              <>
                <Spinner size="sm" className="me-2" />
                {s.t("common.saving")}
              </>
            ) : (
              s.t("account.profileSave")
            )}
          </Button>
        </div>
      </Form>

      <ChangePasswordCard
        t={s.t}
        profile={s.profile}
        pwBusy={s.pwBusy}
        currentPassword={s.currentPassword}
        setCurrentPassword={s.setCurrentPassword}
        newPassword={s.newPassword}
        setNewPassword={s.setNewPassword}
        confirmPassword={s.confirmPassword}
        setConfirmPassword={s.setConfirmPassword}
        totpCode={s.totpCode}
        setTotpCode={s.setTotpCode}
        onChangePassword={s.onChangePassword}
      />
    </>
  );
}
