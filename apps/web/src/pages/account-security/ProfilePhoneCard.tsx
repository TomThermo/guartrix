import { Form, InputGroup } from "react-bootstrap";
import { COUNTRY_DIALS, countryFlagEmoji } from "@msm/shared";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import type { ProfileSectionState } from "./useProfileSection";

type Props = Pick<
  ProfileSectionState,
  | "t"
  | "phoneCountry"
  | "setPhoneCountry"
  | "phoneNational"
  | "setPhoneNational"
  | "phoneMeta"
>;

export function ProfilePhoneCard({
  t,
  phoneCountry,
  setPhoneCountry,
  phoneNational,
  setPhoneNational,
  phoneMeta,
}: Props) {
  return (
    <AdminPanelCard title={t("account.profilePhone")} icon="fa-mobile-screen">
      <p className="text-secondary small mb-3">{t("account.profilePhoneHelp")}</p>
      <Form.Label htmlFor="profile-phone-national">{t("account.profileMobile")}</Form.Label>
      <InputGroup className="profile-phone-input mb-2">
        <Form.Select
          aria-label={t("account.profilePhoneCountry")}
          value={phoneCountry}
          onChange={(e) => setPhoneCountry(e.target.value)}
          className="profile-phone-country"
          style={{ maxWidth: "9.5rem" }}
        >
          {COUNTRY_DIALS.map((c) => (
            <option key={c.code} value={c.code}>
              {countryFlagEmoji(c.code)} +{c.dial} {c.code}
            </option>
          ))}
        </Form.Select>
        <InputGroup.Text className="profile-phone-flag" aria-hidden>
          {countryFlagEmoji(phoneCountry)}
        </InputGroup.Text>
        <Form.Control
          id="profile-phone-national"
          inputMode="tel"
          autoComplete="tel-national"
          value={phoneNational}
          onChange={(e) => setPhoneNational(e.target.value)}
          placeholder={t("account.profileMobilePlaceholder")}
        />
      </InputGroup>
      <Form.Text className="text-secondary">
        {phoneMeta
          ? t("account.profilePhonePreview", {
              e164: phoneNational.replace(/\D/g, "")
                ? `+${phoneMeta.dial}${phoneNational.replace(/\D/g, "").replace(/^0+/, "")}`
                : `+${phoneMeta.dial}…`,
            })
          : null}
      </Form.Text>
    </AdminPanelCard>
  );
}
