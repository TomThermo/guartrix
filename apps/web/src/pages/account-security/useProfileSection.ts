import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AccountProfile, AddressSuggestItem } from "@msm/shared";
import { findCountryDial } from "@msm/shared";
import { api } from "../../api";
import { ApiError } from "../../api/client";
import { useI18n } from "../../i18n/react";

export type EmailStatus = "idle" | "checking" | "ok" | "own" | "taken" | "invalid";

type Options = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export function useProfileSection({ onNotice, onError }: Options) {
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

  return {
    t,
    loading,
    busy,
    pwBusy,
    profile,
    displayName,
    setDisplayName,
    email,
    emailStatus,
    emailFeedback,
    onEmailChange,
    phoneCountry,
    setPhoneCountry,
    phoneNational,
    setPhoneNational,
    phoneMeta,
    addressLine1,
    setAddressLine1,
    addressLine2,
    setAddressLine2,
    addressCity,
    setAddressCity,
    addressPostalCode,
    setAddressPostalCode,
    addressCountry,
    setAddressCountry,
    addressChecked,
    suggestQ,
    suggestions,
    suggestBusy,
    runAddressSuggest,
    onPickSuggestion,
    clearAddressVerification,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    totpCode,
    setTotpCode,
    onSubmit,
    onChangePassword,
  };
}

export type ProfileSectionState = ReturnType<typeof useProfileSection>;
