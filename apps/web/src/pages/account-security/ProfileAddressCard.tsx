import { Alert, Col, Form, InputGroup, Row, Spinner } from "react-bootstrap";
import { COUNTRY_DIALS, countryFlagEmoji } from "@msm/shared";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import type { ProfileSectionState } from "./useProfileSection";

type Props = Pick<
  ProfileSectionState,
  | "t"
  | "suggestQ"
  | "suggestions"
  | "suggestBusy"
  | "runAddressSuggest"
  | "onPickSuggestion"
  | "addressChecked"
  | "addressLine1"
  | "setAddressLine1"
  | "addressLine2"
  | "setAddressLine2"
  | "addressPostalCode"
  | "setAddressPostalCode"
  | "addressCity"
  | "setAddressCity"
  | "addressCountry"
  | "setAddressCountry"
  | "clearAddressVerification"
>;

export function ProfileAddressCard({
  t,
  suggestQ,
  suggestions,
  suggestBusy,
  runAddressSuggest,
  onPickSuggestion,
  addressChecked,
  addressLine1,
  setAddressLine1,
  addressLine2,
  setAddressLine2,
  addressPostalCode,
  setAddressPostalCode,
  addressCity,
  setAddressCity,
  addressCountry,
  setAddressCountry,
  clearAddressVerification,
}: Props) {
  return (
    <AdminPanelCard title={t("account.profileAddress")} icon="fa-location-dot">
      <p className="text-secondary small mb-3">{t("account.profileAddressHelp")}</p>

      <Form.Group className="mb-3" controlId="profile-address-check">
        <Form.Label>{t("account.profileAddressCheck")}</Form.Label>
        <InputGroup>
          <Form.Control
            value={suggestQ}
            onChange={(e) => runAddressSuggest(e.target.value)}
            placeholder={t("account.profileAddressCheckPlaceholder")}
            autoComplete="off"
          />
          {suggestBusy && (
            <InputGroup.Text>
              <Spinner size="sm" />
            </InputGroup.Text>
          )}
        </InputGroup>
        {suggestions.length > 0 && (
          <div className="profile-address-suggest list-group mt-2">
            {suggestions.map((s) => (
              <button
                key={`${s.lat},${s.lon},${s.label}`}
                type="button"
                className="list-group-item list-group-item-action py-2"
                onClick={() => onPickSuggestion(s)}
              >
                <span className="me-1" aria-hidden>
                  {s.addressCountry ? countryFlagEmoji(s.addressCountry) : "📍"}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </Form.Group>

      {addressChecked ? (
        <Alert variant="success" className="py-2 small">
          {t("account.profileAddressVerified")}
        </Alert>
      ) : (
        <Alert variant="secondary" className="py-2 small">
          {t("account.profileAddressUnverified")}
        </Alert>
      )}

      <Row className="g-3">
        <Col md={8}>
          <Form.Group controlId="profile-line1">
            <Form.Label>{t("account.profileAddressLine1")}</Form.Label>
            <Form.Control
              value={addressLine1}
              onChange={(e) => {
                setAddressLine1(e.target.value);
                clearAddressVerification();
              }}
              autoComplete="address-line1"
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group controlId="profile-line2">
            <Form.Label>{t("account.profileAddressLine2")}</Form.Label>
            <Form.Control
              value={addressLine2}
              onChange={(e) => {
                setAddressLine2(e.target.value);
                clearAddressVerification();
              }}
              autoComplete="address-line2"
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group controlId="profile-postal">
            <Form.Label>{t("account.profilePostalCode")}</Form.Label>
            <Form.Control
              value={addressPostalCode}
              onChange={(e) => {
                setAddressPostalCode(e.target.value);
                clearAddressVerification();
              }}
              autoComplete="postal-code"
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group controlId="profile-city">
            <Form.Label>{t("account.profileCity")}</Form.Label>
            <Form.Control
              value={addressCity}
              onChange={(e) => {
                setAddressCity(e.target.value);
                clearAddressVerification();
              }}
              autoComplete="address-level2"
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group controlId="profile-address-country">
            <Form.Label>{t("account.profileAddressCountry")}</Form.Label>
            <Form.Select
              value={addressCountry}
              onChange={(e) => {
                setAddressCountry(e.target.value);
                clearAddressVerification();
              }}
              autoComplete="country"
            >
              {COUNTRY_DIALS.map((c) => (
                <option key={c.code} value={c.code}>
                  {countryFlagEmoji(c.code)} {c.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>
    </AdminPanelCard>
  );
}
