import { Link } from "react-router-dom";
import { Container } from "react-bootstrap";
import { useI18n } from "../i18n/react";

export function TermsPage() {
  const { t } = useI18n();

  return (
    <Container className="py-5" style={{ maxWidth: 720 }}>
      <p className="mb-2">
        <Link to="/login">← {t("legal.back")}</Link>
      </p>
      <h1 className="h3 mb-3">{t("legal.termsTitle")}</h1>
      <p className="text-secondary small">Last updated: July 28, 2026</p>
      <p>
        By creating a Guartrix account or using the panel, you agree to these terms.
        Guartrix provides Minecraft server hosting tools for personal and community use.
      </p>
      <h2 className="h5 mt-4">Accounts</h2>
      <p>
        You are responsible for keeping your password confidential and for activity under
        your account. Do not share credentials. We may suspend accounts that abuse the
        platform, attempt to break out of server jails, mine cryptocurrency, host illegal
        content, or attack other systems.
      </p>
      <h2 className="h5 mt-4">Servers &amp; fair use</h2>
      <p>
        New accounts start without server capacity. Servers, RAM, and databases become
        available after you purchase a plan (or an admin grants quota). Soft-launch capacity
        is limited; we may throttle, migrate, or pause servers to protect the host. Backups
        are best-effort — keep your own copies of important worlds.
      </p>
      <h2 className="h5 mt-4">Acceptable use</h2>
      <p>
        No phishing, malware, spam bots, DDoS tooling, copyright infringement beyond fair
        Minecraft server use, or anything that violates applicable law. Game servers must
        comply with Mojang / Microsoft usage guidelines.
      </p>
      <h2 className="h5 mt-4">Availability</h2>
      <p>
        Soft-launch service is provided as-is without uptime guarantees. Planned or
        emergency maintenance may interrupt the panel or game nodes.
      </p>
      <h2 className="h5 mt-4">Contact</h2>
      <p>
        Questions: contact the Guartrix operators via the channels published on{" "}
        <a href="https://guartrix.com" rel="noreferrer">
          guartrix.com
        </a>
        .
      </p>
    </Container>
  );
}
