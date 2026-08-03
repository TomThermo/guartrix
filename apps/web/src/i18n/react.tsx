import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyDocumentLang,
  getLocale,
  setLocale as setLocaleCore,
  subscribeLocale,
  t as tCore,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "./index";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey | string, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function useLocaleStore(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore();

  useEffect(() => {
    applyDocumentLang(locale);
  }, [locale]);

  const value: I18nContextValue = {
    locale,
    setLocale: setLocaleCore,
    t: tCore,
  };

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
