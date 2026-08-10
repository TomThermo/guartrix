import { config } from "./config.js";
import {
  MAIL_TEMPLATE_IDS,
  resolveTemplateFile,
  type MailTemplateId,
} from "./mail-template-store.js";

export type { MailTemplateId };
export { MAIL_TEMPLATE_IDS };

export type MailTemplateVars = Record<string, string | boolean | number | undefined | null>;

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
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
  const logoRaw = config.appLogo?.trim() || "";
  let logoUrl = logoRaw;
  if (logoRaw && !/^https?:\/\//i.test(logoRaw)) {
    logoUrl = `${panelUrl}${logoRaw.startsWith("/") ? "" : "/"}${logoRaw}`;
  }
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
 * Admin overrides in data/mail-templates.json win over bundled defaults.
 * Optional `draft` parts (Admin preview) override both store and bundled files.
 */
export function renderMail(
  id: MailTemplateId,
  vars: MailTemplateVars = {},
  draft?: Partial<{ subject: string; html: string; text: string; layoutHtml: string; layoutTxt: string }>,
): RenderedMail {
  if (!MAIL_TEMPLATE_IDS.includes(id)) {
    throw new Error(`Unknown mail template: ${id}`);
  }

  const merged: MailTemplateVars = { ...brandingVars(), ...vars };
  const layoutHtml = draft?.layoutHtml ?? resolveTemplateFile("layout.html");
  const layoutTxt = draft?.layoutTxt ?? resolveTemplateFile("layout.txt");
  const bodyHtml = draft?.html ?? resolveTemplateFile(`${id}.html`);
  const bodyTxt = draft?.text ?? resolveTemplateFile(`${id}.txt`);
  const subjectRaw = (draft?.subject ?? resolveTemplateFile(`${id}.subject.txt`)).trim();

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
