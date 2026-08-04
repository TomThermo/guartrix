import "bootstrap/dist/css/bootstrap.min.css";
/* Solid icons only — skip brands/regular webfonts (~136KB). */
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { I18nProvider } from "./i18n/react";
import { initWebSentry } from "./sentry";
import { applyThemePreference, readThemePreference } from "./theme";

applyThemePreference(readThemePreference());
void initWebSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
