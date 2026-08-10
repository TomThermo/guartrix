import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { MAIL_TEMPLATE_FILES } from "./mail-template-content.js";

export type MailTemplateId =
  | "verify-email"
  | "password-reset"
  | "invite-set-password"
  | "invite-server"
  | "alert"
  | "test-mail";

export const MAIL_TEMPLATE_IDS: MailTemplateId[] = [
  "verify-email",
  "password-reset",
  "invite-set-password",
  "invite-server",
  "alert",
  "test-mail",
];
export type MailTemplateParts = {
  subject: string;
  html: string;
  text: string;
};

export type MailTemplatesStored = {
  layoutHtml?: string;
  layoutTxt?: string;
  templates?: Partial<Record<MailTemplateId, Partial<MailTemplateParts>>>;
};

const MAX_PART = 100_000;

function storePath(): string {
  return path.join(config.dataDir, "mail-templates.json");
}

export function readMailTemplateOverridesSync(): MailTemplatesStored {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as MailTemplatesStored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn("[guartrix] Failed to read mail-templates.json:", err);
    }
    return {};
  }
}

export async function readMailTemplateOverrides(): Promise<MailTemplatesStored> {
  try {
    const raw = await fsPromises.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as MailTemplatesStored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    console.warn("[guartrix] Failed to read mail-templates.json:", err);
    return {};
  }
}

export async function writeMailTemplateOverrides(next: MailTemplatesStored): Promise<void> {
  await fsPromises.mkdir(config.dataDir, { recursive: true });
  const tmp = `${storePath()}.tmp`;
  await fsPromises.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fsPromises.rename(tmp, storePath());
}

export function bundledTemplateFile(file: string): string {
  const body = MAIL_TEMPLATE_FILES[file];
  if (body === undefined) throw new Error(`Missing bundled mail template: ${file}`);
  return body;
}

export function resolveTemplateFile(file: string, overrides?: MailTemplatesStored): string {
  const o = overrides ?? readMailTemplateOverridesSync();
  if (file === "layout.html" && o.layoutHtml?.trim()) return o.layoutHtml;
  if (file === "layout.txt" && o.layoutTxt?.trim()) return o.layoutTxt;

  const m = file.match(/^([\w-]+)\.(html|txt|subject\.txt)$/);
  if (m) {
    const id = m[1] as MailTemplateId;
    const kind = m[2];
    const part = o.templates?.[id];
    if (part) {
      if (kind === "html" && part.html?.trim()) return part.html;
      if (kind === "txt" && part.text?.trim()) return part.text;
      if (kind === "subject.txt" && part.subject?.trim()) return part.subject;
    }
  }
  return bundledTemplateFile(file);
}

function clampPart(label: string, value: unknown): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  if (value.length > MAX_PART) throw new Error(`${label} exceeds ${MAX_PART} characters`);
  return value;
}

export function getMailTemplatesAdminView(): {
  ids: MailTemplateId[];
  layoutHtml: string;
  layoutTxt: string;
  layoutHtmlCustom: boolean;
  layoutTxtCustom: boolean;
  templates: Record<
    MailTemplateId,
    MailTemplateParts & { custom: { subject: boolean; html: boolean; text: boolean } }
  >;
} {
  const o = readMailTemplateOverridesSync();
  const templates = {} as Record<
    MailTemplateId,
    MailTemplateParts & { custom: { subject: boolean; html: boolean; text: boolean } }
  >;
  for (const id of MAIL_TEMPLATE_IDS) {
    const subjectCustom = Boolean(o.templates?.[id]?.subject?.trim());
    const htmlCustom = Boolean(o.templates?.[id]?.html?.trim());
    const textCustom = Boolean(o.templates?.[id]?.text?.trim());
    templates[id] = {
      subject: resolveTemplateFile(`${id}.subject.txt`, o).trim(),
      html: resolveTemplateFile(`${id}.html`, o),
      text: resolveTemplateFile(`${id}.txt`, o),
      custom: { subject: subjectCustom, html: htmlCustom, text: textCustom },
    };
  }
  return {
    ids: [...MAIL_TEMPLATE_IDS],
    layoutHtml: resolveTemplateFile("layout.html", o),
    layoutTxt: resolveTemplateFile("layout.txt", o),
    layoutHtmlCustom: Boolean(o.layoutHtml?.trim()),
    layoutTxtCustom: Boolean(o.layoutTxt?.trim()),
    templates,
  };
}

export type MailTemplatesPatch = {
  layoutHtml?: string | null;
  layoutTxt?: string | null;
  templates?: Partial<Record<MailTemplateId, Partial<MailTemplateParts> | null>>;
  /** Reset everything to bundled defaults */
  resetAll?: boolean;
  /** Reset one template id (and optionally layout via layoutHtml/layoutTxt null) */
  resetId?: MailTemplateId;
};

export async function applyMailTemplatesPatch(patch: MailTemplatesPatch): Promise<MailTemplatesStored> {
  if (patch.resetAll) {
    await writeMailTemplateOverrides({});
    return {};
  }

  const current = await readMailTemplateOverrides();
  const next: MailTemplatesStored = {
    layoutHtml: current.layoutHtml,
    layoutTxt: current.layoutTxt,
    templates: { ...(current.templates ?? {}) },
  };

  if (patch.resetId) {
    if (!MAIL_TEMPLATE_IDS.includes(patch.resetId)) {
      throw new Error(`Unknown template id: ${patch.resetId}`);
    }
    delete next.templates![patch.resetId];
  }

  if (patch.layoutHtml !== undefined) {
    next.layoutHtml =
      patch.layoutHtml === null || patch.layoutHtml === ""
        ? undefined
        : clampPart("layoutHtml", patch.layoutHtml);
  }
  if (patch.layoutTxt !== undefined) {
    next.layoutTxt =
      patch.layoutTxt === null || patch.layoutTxt === ""
        ? undefined
        : clampPart("layoutTxt", patch.layoutTxt);
  }

  if (patch.templates) {
    for (const [id, parts] of Object.entries(patch.templates) as Array<
      [MailTemplateId, Partial<MailTemplateParts> | null]
    >) {
      if (!MAIL_TEMPLATE_IDS.includes(id)) throw new Error(`Unknown template id: ${id}`);
      if (parts === null) {
        delete next.templates![id];
        continue;
      }
      const prev = next.templates![id] ?? {};
      const merged: Partial<MailTemplateParts> = { ...prev };
      if (parts.subject !== undefined) {
        if (parts.subject === "") delete merged.subject;
        else merged.subject = clampPart(`${id}.subject`, parts.subject);
      }
      if (parts.html !== undefined) {
        if (parts.html === "") delete merged.html;
        else merged.html = clampPart(`${id}.html`, parts.html);
      }
      if (parts.text !== undefined) {
        if (parts.text === "") delete merged.text;
        else merged.text = clampPart(`${id}.text`, parts.text);
      }
      if (!merged.subject && !merged.html && !merged.text) delete next.templates![id];
      else next.templates![id] = merged;
    }
  }

  if (!next.layoutHtml) delete next.layoutHtml;
  if (!next.layoutTxt) delete next.layoutTxt;
  if (!next.templates || Object.keys(next.templates).length === 0) delete next.templates;

  await writeMailTemplateOverrides(next);
  return next;
}

/** Sample vars for Admin preview */
export function previewVarsFor(id: MailTemplateId): Record<string, string> {
  const base = {
    username: "Alex",
    inviterName: "Admin",
    serverName: "Survival",
    actionUrl: `${config.publicBaseUrl.replace(/\/$/, "")}/example-link`,
    expiresIn: "48 hours",
    eventTitle: "Server crashed",
    eventBody: "survival-1 exited unexpectedly\nNode: node-1",
    sentAt: new Date().toISOString(),
    smtpHost: config.mail.smtpHost || "mail.example.com",
    smtpPort: String(config.mail.smtpPort || 587),
  };
  return base;
}
