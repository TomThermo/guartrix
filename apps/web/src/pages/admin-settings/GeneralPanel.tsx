import { Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type GeneralPanelProps = {
  appName: string;
  onAppNameChange: (value: string) => void;
  appLogo: string;
  onAppLogoChange: (value: string) => void;
  appFavicon: string;
  onAppFaviconChange: (value: string) => void;
  publicHost: string;
  onPublicHostChange: (value: string) => void;
  publicBaseUrl: string;
  onPublicBaseUrlChange: (value: string) => void;
  registrationEnabled: boolean;
  onRegistrationEnabledChange: (value: boolean) => void;
  defaultMaxServers: number;
  onDefaultMaxServersChange: (value: number) => void;
  defaultMaxMemoryMb: number;
  onDefaultMaxMemoryMbChange: (value: number) => void;
  defaultMaxDatabases: number;
  onDefaultMaxDatabasesChange: (value: number) => void;
  cloudflareDomain: string;
  onCloudflareDomainChange: (value: string) => void;
  cloudflareZoneId: string;
  onCloudflareZoneIdChange: (value: string) => void;
  cloudflareApiToken: string;
  onCloudflareApiTokenChange: (value: string) => void;
  cloudflareApiTokenSet: boolean;
};

export function GeneralPanel({
  appName,
  onAppNameChange,
  appLogo,
  onAppLogoChange,
  appFavicon,
  onAppFaviconChange,
  publicHost,
  onPublicHostChange,
  publicBaseUrl,
  onPublicBaseUrlChange,
  registrationEnabled,
  onRegistrationEnabledChange,
  defaultMaxServers,
  onDefaultMaxServersChange,
  defaultMaxMemoryMb,
  onDefaultMaxMemoryMbChange,
  defaultMaxDatabases,
  onDefaultMaxDatabasesChange,
  cloudflareDomain,
  onCloudflareDomainChange,
  cloudflareZoneId,
  onCloudflareZoneIdChange,
  cloudflareApiToken,
  onCloudflareApiTokenChange,
  cloudflareApiTokenSet,
}: GeneralPanelProps) {
  const { t } = useI18n();

  return (
    <Row className="g-3">
      <Col xs={12}>
        <h2 className="admin-section-title">
          <i className="fa-solid fa-palette" aria-hidden />
          {t("adminSettings.brandingHeading")}
        </h2>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.appName")}</Form.Label>
          <Form.Control
            value={appName}
            onChange={(e) => onAppNameChange(e.target.value)}
            required
            maxLength={64}
          />
          <Form.Text muted>{t("adminSettings.appNameHelp")}</Form.Text>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.appLogo")}</Form.Label>
          <Form.Control
            value={appLogo}
            onChange={(e) => onAppLogoChange(e.target.value)}
            placeholder="/logo.svg"
            className="font-monospace"
          />
          <Form.Text muted>{t("adminSettings.appLogoHelp")}</Form.Text>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.appFavicon")}</Form.Label>
          <Form.Control
            value={appFavicon}
            onChange={(e) => onAppFaviconChange(e.target.value)}
            placeholder="/favicon.ico"
            className="font-monospace"
          />
          <Form.Text muted>{t("adminSettings.appFaviconHelp")}</Form.Text>
        </Form.Group>
      </Col>

      <Col xs={12}>
        <h2 className="admin-section-title">
          <i className="fa-solid fa-globe" aria-hidden />
          {t("adminSettings.publicHeading")}
        </h2>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.publicHost")}</Form.Label>
          <Form.Control
            value={publicHost}
            onChange={(e) => onPublicHostChange(e.target.value)}
            required
          />
          <Form.Text muted>{t("adminSettings.publicHostHelp")}</Form.Text>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.publicBaseUrl")}</Form.Label>
          <Form.Control
            value={publicBaseUrl}
            onChange={(e) => onPublicBaseUrlChange(e.target.value)}
            required
          />
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Form.Check
          type="switch"
          id="registration-enabled"
          label={t("adminSettings.registrationEnabled")}
          checked={registrationEnabled}
          onChange={(e) => onRegistrationEnabledChange(e.target.checked)}
        />
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.defaultMaxServers")}</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={defaultMaxServers}
            onChange={(e) =>
              onDefaultMaxServersChange(Number(e.target.value) || 0)
            }
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.defaultMaxMemoryMb")}</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={defaultMaxMemoryMb}
            onChange={(e) =>
              onDefaultMaxMemoryMbChange(Number(e.target.value) || 0)
            }
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.defaultMaxDatabases")}</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={defaultMaxDatabases}
            onChange={(e) =>
              onDefaultMaxDatabasesChange(Number(e.target.value) || 0)
            }
          />
        </Form.Group>
      </Col>

      <Col xs={12}>
        <h2 className="admin-section-title">
          <i className="fa-solid fa-cloud" aria-hidden />
          {t("adminSettings.cloudflareHeading")}
        </h2>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.cfDomain")}</Form.Label>
          <Form.Control
            value={cloudflareDomain}
            onChange={(e) => onCloudflareDomainChange(e.target.value)}
            placeholder="example.com"
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.cfZoneId")}</Form.Label>
          <Form.Control
            value={cloudflareZoneId}
            onChange={(e) => onCloudflareZoneIdChange(e.target.value)}
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.cfApiToken")}</Form.Label>
          <Form.Control
            type="password"
            autoComplete="new-password"
            value={cloudflareApiToken}
            onChange={(e) => onCloudflareApiTokenChange(e.target.value)}
            placeholder={
              cloudflareApiTokenSet
                ? t("adminSettings.secretSet")
                : t("adminSettings.secretEmpty")
            }
          />
        </Form.Group>
      </Col>
    </Row>
  );
}
