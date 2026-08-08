import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Col, Form, InputGroup, Row, Spinner } from "react-bootstrap";
import type { AccountProfile, AddressSuggestItem } from "@msm/shared";
import {
  COUNTRY_DIALS,
  countryFlagEmoji,
  findCountryDial,
} from "@msm/shared";
import { api } from "../../api";
import { ApiError } from "../../api/client";
import { useI18n } from "../../i18n/react";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";

type Props = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

type EmailStatus = "idle" | "checking" | "ok" | "own" | "taken" | "invalid";

export function ProfileSection({ onNotice, onError }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [phoneCountry, setPhoneCountry] = useState("NL");
  const [phoneNational, setPhoneNational] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("NL");
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLon, setAddressLon] = useState<number | null>(null);
  const [addressVerifiedAt, setAddressVerifiedAt] = useState<string | null>(null);

  const [suggestQ, setSuggestQ] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestItem[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  const applyProfile = useCallback((p: AccountProfile) => {
    setProfile(p);
    setDisplayName(p.displayName ?? "");
    setEmail(p.email ?? "");
    setEmailStatus(p.email ? "own" : "idle");
    setPhoneCountry(p.phoneCountry || "NL");
    setPhoneNational(p.phoneNational ?? "");
    setAddressLine1(p.addressLine1 ?? "");
    setAddressLine2(p.addressLine2 ?? "");
    setAddressCity(p.addressCity ?? "");
    setAddressPostalCode(p.addressPostalCode ?? "");
    setAddressCountry(p.addressCountry || "NL");
    setAddressLat(p.addressLat);
    setAddressLon(p.addressLon);
    setAddressVerifiedAt(p.addressVerifiedAt);
  }, []);

  useEffect(() => {
    setLoading(true);
    void api
      .getAccountProfile()
      .then((res) => applyProfile(res.profile))
      .catch((err) => onError(err instanceof Error ? err.message : t("common.requestFailed")))
      .finally(() => setLoading(false));
  }, [applyProfile, onError, t]);

  function clearAddressVerification() {
    setAddressLat(null);
    setAddressLon(null);
    setAddressVerifiedAt(null);
  }

  function onPickSuggestion(item: AddressSuggestItem) {
    setAddressLine1(item.addressLine1);
    setAddressLine2(item.addressLine2 ?? "");
    setAddressCity(item.addressCity);
    setAddressPostalCode(item.addressPostalCode);
    if (item.addressCountry) setAddressCountry(item.addressCountry);
    setAddressLat(item.lat);
    setAddressLon(item.lon);
    setAddressVerifiedAt(new Date().toISOString());
    setSuggestions([]);
    setSuggestQ(item.label);
  }

  function runAddressSuggest(query: string) {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    setSuggestQ(query);
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(() => {
      setSuggestBusy(true);
      void api
        .suggestAddress(query.trim(), addressCountry || undefined)
        .then((res) => setSuggestions(res.suggestions))
        .catch(() => setSuggestions([]))
        .finally(() => setSuggestBusy(false));
    }, 400);
  }

  function onEmailChange(value: string) {
    setEmail(value);
    if (emailTimer.current) clearTimeout(emailTimer.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setEmailStatus("idle");
      return;
    }
    const current = (profile?.email ?? "").toLowerCase();
    if (trimmed.toLowerCase() === current) {
      setEmailStatus("own");
      return;
    }
    setEmailStatus("checking");
    emailTimer.current = setTimeout(() => {
      void api
        .checkEmailAvailable(trimmed)
        .then((res) => {
          if (!res.valid) setEmailStatus("invalid");
          else if (res.own) setEmailStatus("own");
          else if (res.available) setEmailStatus("ok");
          else setEmailStatus("taken");
        })
        .catch(() => setEmailStatus("idle"));
    }, 450);
  }

  function mapApiError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.code === "EMAIL_TAKEN") return t("account.profileEmailTaken");
      if (err.code === "TOTP_REQUIRED") return t("account.passwordTotpRequired");
      if (err.code === "BAD_TOTP") return t("account.passwordTotpInvalid");
      if (err.code === "BAD_PASSWORD") return t("account.passwordCurrentInvalid");
      return err.message;
    }
    return err instanceof Error ? err.message : t("common.requestFailed");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (emailStatus === "taken") {
      onError(t("account.profileEmailTaken"));
      return;
    }
    if (emailStatus === "invalid") {
      onError(t("account.profileEmailInvalid"));
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const res = await api.updateAccountProfile({
        displayName: displayName.trim() || null,
        email: email.trim() || null,
        phoneCountry: phoneNational.trim() ? phoneCountry : null,
        phoneNational: phoneNational.trim() || null,
        addressLine1: addressLine1.trim() || null,
        addressLine2: addressLine2.trim() || null,
        addressCity: addressCity.trim() || null,
        addressPostalCode: addressPostalCode.trim() || null,
        addressCountry: addressCountry || null,
        addressLat,
        addressLon,
        clearAddressVerification: addressLat == null && addressLon == null,
      });
      applyProfile(res.profile);
      onNotice(
        res.emailVerificationSent
          ? t("account.profileSavedVerifyEmail")
          : t("account.profileSaved"),
      );
    } catch (err) {
      onError(mapApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onError(t("account.passwordMismatch"));
      return;
    }
    setPwBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.changeAccountPassword({
        currentPassword,
        newPassword,
        confirmPassword,
        totpCode: profile?.twoFactorEnabled ? totpCode.trim() : undefined,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTotpCode("");
      onNotice(t("account.passwordChanged"));
    } catch (err) {
      onError(mapApiError(err));
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-secondary py-4">
        <Spinner size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  const phoneMeta = findCountryDial(phoneCountry);
  const addressChecked = Boolean(addressVerifiedAt && addressLat != null && addressLon != null);
  const emailFeedback =
    emailStatus === "checking"
      ? t("account.profileEmailChecking")
      : emailStatus === "taken"
        ? t("account.profileEmailTaken")
        : emailStatus === "invalid"
          ? t("account.profileEmailInvalid")
          : emailStatus === "ok"
            ? t("account.profileEmailAvailable")
            : profile?.emailVerified
              ? t("account.profileEmailVerified")
              : t("account.profileEmailUnverified");

  return (
    <>
      <Form onSubmit={(e) => void onSubmit(e)} className="mb-4">
        <Row className="g-4">
          <Col lg={6}>
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
          </Col>

          <Col lg={6}>
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
          </Col>

          <Col xs={12}>
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
          </Col>
        </Row>

        <div className="d-flex justify-content-end mt-3">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || emailStatus === "taken" || emailStatus === "checking"}
          >
            {busy ? (
              <>
                <Spinner size="sm" className="me-2" />
                {t("common.saving")}
              </>
            ) : (
              t("account.profileSave")
            )}
          </Button>
        </div>
      </Form>

      <Form onSubmit={(e) => void onChangePassword(e)} className="mb-4">
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
    </>
  );
}
