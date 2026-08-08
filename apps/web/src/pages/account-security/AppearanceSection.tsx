import { useEffect, useState, type CSSProperties } from "react";
import { Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import type { Locale } from "../../i18n";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import {
  PALETTES,
  readPalettePreference,
  setPalettePreference,
  type PaletteId,
  type PaletteMeta,
} from "../../palettes";
import {
  readThemePreference,
  refreshThemeColorMeta,
  setThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from "../../theme";
import { refreshGuartrixMonacoThemes } from "../../components/file-manager/monacoTheme";

function ThemeModeMock({ mode }: { mode: "dark" | "light" | "system" }) {
  if (mode === "system") {
    return (
      <span className="account-theme-mock account-theme-mock--system" aria-hidden>
        <span className="account-theme-mock__half account-theme-mock__half--dark">
          <span className="account-theme-mock__bar" />
          <span className="account-theme-mock__card" />
        </span>
        <span className="account-theme-mock__half account-theme-mock__half--light">
          <span className="account-theme-mock__bar" />
          <span className="account-theme-mock__card" />
        </span>
      </span>
    );
  }
  return (
    <span className={`account-theme-mock account-theme-mock--${mode}`} aria-hidden>
      <span className="account-theme-mock__bar" />
      <span className="account-theme-mock__body">
        <span className="account-theme-mock__side" />
        <span className="account-theme-mock__main">
          <span className="account-theme-mock__card" />
          <span className="account-theme-mock__btn" />
        </span>
      </span>
    </span>
  );
}

function PalettePanelMock({ pal, mode }: { pal: PaletteMeta; mode: "dark" | "light" }) {
  const sw = mode === "light" ? pal.light : pal.dark;
  const accent2 = sw.accent2 ?? sw.accent;
  return (
    <span
      className={`account-palette-mock account-palette-mock--${pal.mood}`}
      aria-hidden
      style={
        {
          "--mock-deep": sw.deep,
          "--mock-raised": sw.raised,
          "--mock-accent": sw.accent,
          "--mock-accent-2": accent2,
          "--mock-text": mode === "light" ? "#1a1a1a" : "#f2f2f2",
          "--mock-muted": mode === "light" ? "#5a5a5a" : "#9a9a9a",
        } as CSSProperties
      }
    >
      <header className="account-palette-mock__nav">
        <span className="account-palette-mock__brand" />
        <span className="account-palette-mock__nav-links">
          <span />
          <span />
        </span>
        <span className="account-palette-mock__avatar" />
      </header>
      <div className="account-palette-mock__shell">
        <aside className="account-palette-mock__side">
          <span className="account-palette-mock__side-item is-active" />
          <span className="account-palette-mock__side-item" />
          <span className="account-palette-mock__side-item" />
        </aside>
        <main className="account-palette-mock__main">
          <article className="account-palette-mock__card">
            <span className="account-palette-mock__card-head" />
            <span className="account-palette-mock__card-line" />
            <span className="account-palette-mock__card-line account-palette-mock__card-line--short" />
            <div className="account-palette-mock__actions">
              <button type="button" className="account-palette-mock__btn" tabIndex={-1} />
              <span className="account-palette-mock__chip" />
              <span className="account-palette-mock__chip account-palette-mock__chip--alt" />
            </div>
          </article>
        </main>
      </div>
    </span>
  );
}

export function AppearanceSection() {
  const { t, locale, setLocale } = useI18n();
  const [themePref, setThemePref] = useState<ThemePreference>(() => readThemePreference());
  const [paletteId, setPaletteId] = useState<PaletteId>(() => readPalettePreference());

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

  const previewMode: "dark" | "light" =
    themePref === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : themePref;

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

        <h3 className="account-palette-heading account-palette-heading--first">
          {t("account.themeModeTitle")}
        </h3>
        <div className="account-theme-tiles" role="radiogroup" aria-label={t("account.appearance")}>
          {themeOptions.map((opt) => (
            <label
              key={opt.value}
              className="account-theme-tile"
              htmlFor={`theme-${opt.value}`}
            >
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
              <ThemeModeMock mode={opt.value} />
              <span className="account-theme-tile__meta">
                <span className="account-theme-option__label">{opt.label}</span>
                <span className="account-theme-option__hint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <h3 className="account-palette-heading">{t("account.paletteTitle")}</h3>
        <p className="text-secondary small mb-2">{t("account.paletteHelp")}</p>
        <div
          className="account-palette-gallery"
          role="radiogroup"
          aria-label={t("account.paletteTitle")}
        >
          {PALETTES.map((pal) => (
            <label
              key={pal.id}
              className="account-palette-card"
              htmlFor={`palette-${pal.id}`}
              data-palette={pal.id}
              data-mood={pal.mood}
            >
              <input
                type="radio"
                id={`palette-${pal.id}`}
                name="guartrix-palette"
                checked={paletteId === pal.id}
                onChange={() => {
                  setPaletteId(pal.id);
                  setPalettePreference(pal.id);
                  refreshThemeColorMeta();
                  refreshGuartrixMonacoThemes();
                }}
              />
              <PalettePanelMock pal={pal} mode={previewMode} />
              <span className="account-palette-card__meta">
                <span className="account-palette-option__label">{t(pal.nameKey)}</span>
                <span className="account-palette-option__hint">{t(pal.hintKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </AdminPanelCard>
    </div>
  );
}
