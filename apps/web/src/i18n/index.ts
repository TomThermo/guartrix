import { en, type Messages } from "./locales/en";

export type Locale = "en" | "nl";
export type { Messages };

export const LOCALES: readonly Locale[] = ["en", "nl"] as const;
export const LOCALE_STORAGE_KEY = "guartrix.locale";

/** English is always eager (fallback). Dutch loads on demand to shrink the main chunk. */
const catalogs: Partial<Record<Locale, Messages>> = { en };

let nlLoad: Promise<void> | null = null;

function ensureNlCatalog(): Promise<void> {
  if (catalogs.nl) return Promise.resolve();
  if (!nlLoad) {
    nlLoad = import("./locales/nl").then((m) => {
      catalogs.nl = m.nl;
    });
  }
  return nlLoad;
}

type NestedPaths<T, Prefix extends string = ""> = T extends string
  ? Prefix extends ""
    ? never
    : Prefix
  : {
      [K in keyof T & string]: NestedPaths<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

/** Dot-path keys into the message catalog, e.g. `nav.signOut`. */
export type MessageKey = NestedPaths<Messages>;

export type TranslateParams = Record<string, string | number>;

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "nl") return stored;
  } catch {
    /* ignore */
  }
  try {
    const lang = navigator.language?.toLowerCase() ?? "";
    if (lang.startsWith("nl")) return "nl";
  } catch {
    /* ignore */
  }
  return "en";
}

let currentLocale: Locale = detectLocale();

type LocaleListener = (locale: Locale) => void;
const listeners = new Set<LocaleListener>();

function notify() {
  for (const fn of listeners) fn(currentLocale);
}

/** Subscribe to locale changes (used by React provider). Returns unsubscribe. */
export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale !== "en" && locale !== "nl") return;
  if (locale === currentLocale) {
    applyDocumentLang(locale);
    return;
  }
  currentLocale = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  applyDocumentLang(locale);
  if (locale === "nl") {
    void ensureNlCatalog().then(() => notify());
  } else {
    notify();
  }
}

export function applyDocumentLang(locale: Locale = currentLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

function resolvePath(messages: Messages, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = messages;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] != null ? String(params[name]) : `{${name}}`,
  );
}

/**
 * Translate a message key for the current locale.
 * Falls back to English, then to the key itself.
 * Dutch may briefly fall back to English until the lazy catalog resolves.
 */
export function t(key: MessageKey | string, params?: TranslateParams): string {
  if (currentLocale === "nl" && !catalogs.nl) {
    void ensureNlCatalog().then(() => notify());
  }
  const primary = catalogs[currentLocale]
    ? resolvePath(catalogs[currentLocale]!, key)
    : undefined;
  const fallback =
    currentLocale === "en" ? undefined : resolvePath(catalogs.en!, key);
  const template = primary ?? fallback ?? key;
  return interpolate(template, params);
}

/** Kick off NL catalog if boot locale is Dutch; set document lang. */
applyDocumentLang(currentLocale);
if (currentLocale === "nl") {
  void ensureNlCatalog().then(() => notify());
}
