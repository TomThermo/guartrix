import { Link } from "react-router-dom";
import { Container } from "react-bootstrap";
import { useI18n } from "../i18n/react";

export function PrivacyPage() {
  const { t } = useI18n();

  return (
    <Container className="py-5" style={{ maxWidth: 720 }}>
      <p className="mb-2">
        <Link to="/login">← {t("legal.back")}</Link>
      </p>
      <h1 className="h3 mb-3">{t("legal.privacyTitle")}</h1>
      <p className="text-secondary small">Last updated: August 3, 2026</p>
      <p>This policy describes what Guartrix collects when you use the panel at guartrix.com.</p>
      <h2 className="h5 mt-4">What we store</h2>
      <ul>
        <li>Account username, email, password hash (not plaintext passwords)</li>
        <li>Session cookies to keep you signed in</li>
        <li>Server configs, files, backups, and MySQL databases you create</li>
        <li>Operational logs (panel, game nodes, SFTP auth) for security and debugging</li>
        <li>Password-reset tokens (hashed) until used or expired</li>
      </ul>
      <h2 className="h5 mt-4">Your rights</h2>
      <p>
        Signed-in users can export their account data or delete their account under{" "}
        <Link to="/account/security?tab=privacy">Account → Security → Privacy</Link>.
      </p>
      <h2 className="h5 mt-4">How we use it</h2>
      <p>
        Data is used to run the panel, authenticate you (including SFTP), send reset emails, enforce
        quotas, and keep the platform secure. We do not sell personal data.
      </p>
      <h2 className="h5 mt-4">Email</h2>
      <p>
        If SMTP is configured, password-reset messages are sent to the address on your account.
        Without SMTP, messages are written to an operator outbox on the host.
      </p>
      <h2 className="h5 mt-4">Retention</h2>
      <p>
        Account and server data remain until you or an admin delete them. Logs and mail outbox files
        may be rotated periodically. Deleted servers may linger briefly in backups until cleaned up.
      </p>
      <h2 className="h5 mt-4">Contact</h2>
      <p>
        Privacy questions: contact the Guartrix operators via{" "}
        <a href="https://guartrix.com" rel="noreferrer">
          guartrix.com
        </a>
        .
      </p>
    </Container>
  );
}
