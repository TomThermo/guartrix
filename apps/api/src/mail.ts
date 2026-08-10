export * from "./infra/mail.js";
export {
  renderMail,
  applyTemplate,
  type RenderedMail,
} from "./infra/mail-templates.js";
export {
  MAIL_TEMPLATE_IDS,
  getMailTemplatesAdminView,
  applyMailTemplatesPatch,
  previewVarsFor,
  type MailTemplateId,
  type MailTemplatesPatch,
} from "./infra/mail-template-store.js";
