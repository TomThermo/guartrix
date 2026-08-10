import { config } from "./config.js";
import { MAIL_TEMPLATE_FILES } from "./mail-template-content.js";

export type MailTemplateId =
  | "verify-email"
  | "password-reset"
  | "invite-set-password"
  | "invite-server"
  | "alert"
  | "test-mail";

export type MailTemplateVars = Record<string, string | boolean | number | undefined | null>;

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

const TEMPLATE_IDS: MailTemplateId[] = [
  "verify-email",
  "password-reset",
  "invite-set-password",
  "invite-server",
  "alert",
  "test-mail",
];

function readTemplate(file: string): string {
  const body = MAIL_TEMPLATE_FILES[file];
  if (body === undefined) {
    throw new Error(`Missing mail template file: ${file}`);
  }
  return body;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isTruthy(value: string | boolean | number | undefined | null): boolean {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (value === 0) return false;
  return true;
}

/** Mustache-lite: {{var}}, {{#var}}…{{/var}}, {{^var}}…{{/var}}. */
export function applyTemplate(
  source: string,
  vars: MailTemplateVars,
  opts: { escape: boolean },
): string {
  let out = source;

  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    return isTruthy(vars[key]) ? applyTemplate(inner, vars, opts) : "";
  });
  out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    return !isTruthy(vars[key]) ? applyTemplate(inner, vars, opts) : "";
  });

  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const raw = vars[key];
    if (raw === undefined || raw === null) return "";
    const str = String(raw);
    return opts.escape ? escapeHtml(str) : str;
  });

  return out;
}

function brandingVars(): MailTemplateVars {
  const panelUrl = config.publicBaseUrl.replace(/\/$/, "");
  const logoUrl = config.appLogo?.trim() || "";
  const fromRaw = config.mail.from.trim() || "noreply@guartrix.com";
  const fromAddress = fromRaw.includes("<")
    ? (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw)
    : fromRaw;
  return {
    appName: config.appName || "Guartrix",
    panelUrl,
    logoUrl,
    logo: Boolean(logoUrl),
    fromAddress,
  };
}

/**
 * Render a branded multipart mail (subject + text + html).
 * HTML substitution escapes user/branding vars; content is inserted after escape.
 */
export function renderMail(id: MailTemplateId, vars: MailTemplateVars = {}): RenderedMail {
  if (!TEMPLATE_IDS.includes(id)) {
    throw new Error(`Unknown mail template: ${id}`);
  }

  const merged: MailTemplateVars = { ...brandingVars(), ...vars };
  const layoutHtml = readTemplate("layout.html");
  const layoutTxt = readTemplate("layout.txt");
  const bodyHtml = readTemplate(`${id}.html`);
  const bodyTxt = readTemplate(`${id}.txt`);
  const subjectRaw = readTemplate(`${id}.subject.txt`).trim();

  const contentHtml = applyTemplate(bodyHtml, merged, { escape: true });
  const contentTxt = applyTemplate(bodyTxt, merged, { escape: false });

  const html = applyTemplate(
    layoutHtml.replace("{{content}}", "__CONTENT__"),
    { ...merged, content: "__CONTENT__" },
    { escape: true },
  ).replace("__CONTENT__", contentHtml);

  const text = applyTemplate(
    layoutTxt.replace("{{content}}", "__CONTENT__"),
    { ...merged, content: "__CONTENT__" },
    { escape: false },
  ).replace("__CONTENT__", contentTxt);

  const subject = applyTemplate(subjectRaw, merged, { escape: false }).replace(/\s+/g, " ").trim();

  return { subject, text, html };
}
