import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type PublicBranding = {
  appName: string;
  appLogo: string;
  appFavicon: string;
  unitPrefix: "binary" | "decimal";
  navigationType: "sidebar" | "topbar" | "mixed";
  displayWidth: "xl" | "2xl" | "full";
  debugMode: boolean;
};

const DEFAULTS: PublicBranding = {
  appName: "Guartrix",
  appLogo: "",
  appFavicon: "/favicon.ico",
  unitPrefix: "binary",
  navigationType: "mixed",
  displayWidth: "xl",
  debugMode: false,
};

const BrandingContext = createContext<PublicBranding>(DEFAULTS);

function applyDomBranding(b: PublicBranding) {
  document.title = b.appName;
  document.documentElement.dataset.displayWidth = b.displayWidth;
  document.documentElement.dataset.unitPrefix = b.unitPrefix;
  document.documentElement.dataset.navType = b.navigationType;

  const href = b.appFavicon || "/favicon.ico";
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PublicBranding>(DEFAULTS);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/public/branding", {
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<PublicBranding>;
      const next: PublicBranding = {
        appName: data.appName?.trim() || DEFAULTS.appName,
        appLogo: data.appLogo?.trim() || "",
        appFavicon: data.appFavicon?.trim() || DEFAULTS.appFavicon,
        unitPrefix: data.unitPrefix === "decimal" ? "decimal" : "binary",
        navigationType:
          data.navigationType === "sidebar" ||
          data.navigationType === "topbar" ||
          data.navigationType === "mixed"
            ? data.navigationType
            : "mixed",
        displayWidth:
          data.displayWidth === "2xl" || data.displayWidth === "full" || data.displayWidth === "xl"
            ? data.displayWidth
            : "xl",
        debugMode: Boolean(data.debugMode),
      };
      setBranding(next);
      applyDomBranding(next);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener("guartrix:branding-changed", onChanged);
    return () => window.removeEventListener("guartrix:branding-changed", onChanged);
  }, [refresh]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): PublicBranding {
  return useContext(BrandingContext);
}
