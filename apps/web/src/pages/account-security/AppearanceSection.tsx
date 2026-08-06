import { useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import type { Locale } from "../../i18n";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import {
  readThemePreference,
  setThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from "../../theme";

export function AppearanceSection() {
  const { t, locale, setLocale } = useI18n();
  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    readThemePreference(),
  );

  useEffect(() => {
    return watchSystemTheme(themePref);
  }, [themePref]);

  const themeOptions = [
    {
      value: "dark" as const,
      label: t("account.themeDark"),
      hint: t("account.themeDarkHint"),
    },
    {
      value: "light" as const,
      label: t("account.themeLight"),
      hint: t("account.themeLightHint"),
    },
    {
      value: "system" as const,
      label: t("account.themeSystem"),
      hint: t("account.themeSystemHint"),
    },
  ];

  return (
    <div className="account-prefs-grid mb-4">
      <AdminPanelCard title={t("account.language")} icon="fa-language">
        <p className="text-secondary small mb-3">{t("account.languageHelp")}</p>
        <Form.Group controlId="account-language" className="mb-0">
          <Form.Select
            value={locale}
            aria-label={t("account.language")}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="en">{t("account.languageEn")}</option>
            <option value="nl">{t("account.languageNl")}</option>
          </Form.Select>
        </Form.Group>
      </AdminPanelCard>

      <AdminPanelCard title={t("account.appearance")} icon="fa-palette">
        <p className="text-secondary small mb-3">{t("account.appearanceHelp")}</p>
        <div className="account-theme-list" role="radiogroup" aria-label={t("account.appearance")}>
          {themeOptions.map((opt) => (
            <label key={opt.value} className="account-theme-option" htmlFor={`theme-${opt.value}`}>
              <input
                type="radio"
                id={`theme-${opt.value}`}
                name="guartrix-theme"
                checked={themePref === opt.value}
                onChange={() => {
                  setThemePref(opt.value);
                  setThemePreference(opt.value);
                }}
              />
              <span>
                <span className="account-theme-option__label">{opt.label}</span>
                <span className="account-theme-option__hint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </AdminPanelCard>
    </div>
  );
}
