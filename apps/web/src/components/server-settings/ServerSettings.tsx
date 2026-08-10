import type { ServerDetail } from "@guartrix/shared";
import { Button, Col, Form, Row } from "react-bootstrap";
import { CATEGORIES } from "./settings-fields";
import { SettingsCategoryNav } from "./SettingsCategoryNav";
import { SettingsGeneralPanel } from "./SettingsGeneralPanel";
import { SettingsWorldPanel } from "./SettingsWorldPanel";
import { SettingsGameplayPanel } from "./SettingsGameplayPanel";
import { SettingsNetworkPanel } from "./SettingsNetworkPanel";
import { SettingsPerformancePanel } from "./SettingsPerformancePanel";
import { SettingsStartupPanel } from "./SettingsStartupPanel";
import { useServerSettings } from "./useServerSettings";

interface Props {
  server: ServerDetail;
  onSaved: (server: ServerDetail) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  canUpdateSettings?: boolean;
  canUpdateStartup?: boolean;
}

export function ServerSettings({
  server,
  onSaved,
  onError,
  onNotice,
  canUpdateSettings = true,
  canUpdateStartup = true,
}: Props) {
  const s = useServerSettings({
    server,
    onSaved,
    onError,
    onNotice,
    canUpdateSettings,
    canUpdateStartup,
  });
  const activeCategory = CATEGORIES.find((c) => c.id === s.category) ?? CATEGORIES[0];
  const settingsLabel = (id: typeof s.category) => s.t(`settings.${id}`);

  return (
    <Row className="g-4">
      <Col xs={12} sm={4} lg={3}>
        <SettingsCategoryNav category={s.category} onCategoryChange={s.setCategory} />
      </Col>

      <Col xs={12} sm={8} lg={9}>
        <div className="mb-3 d-none d-sm-block">
          <h2 className="h5 mb-1">{settingsLabel(activeCategory.id)}</h2>
          <p className="text-secondary small mb-0">{s.t(activeCategory.hintKey)}</p>
        </div>
        <div className="mb-3 d-sm-none">
          <p className="text-secondary small mb-0">{s.t(activeCategory.hintKey)}</p>
        </div>

        <Form onSubmit={s.onSave}>
          {s.category === "general" && (
            <SettingsGeneralPanel
              server={server}
              connect={s.connect}
              port={s.port}
              setPort={s.setPort}
              name={s.name}
              setName={s.setName}
              props={s.props}
              setProp={s.setProp}
              autoRestart={s.autoRestart}
              setAutoRestart={s.setAutoRestart}
              startOnBoot={s.startOnBoot}
              setStartOnBoot={s.setStartOnBoot}
              ownerId={s.ownerId}
              setOwnerId={s.setOwnerId}
              users={s.users}
              isAdmin={s.isAdmin}
              settingsEditable={s.settingsEditable}
              startupEditable={s.startupEditable}
              ownerAlertWebhookUrl={s.ownerAlertWebhookUrl}
              setOwnerAlertWebhookUrl={s.setOwnerAlertWebhookUrl}
              ownerAlertEmail={s.ownerAlertEmail}
              setOwnerAlertEmail={s.setOwnerAlertEmail}
              discordStatusWebhookUrl={s.discordStatusWebhookUrl}
              setDiscordStatusWebhookUrl={s.setDiscordStatusWebhookUrl}
              discordStatusEnabled={s.discordStatusEnabled}
              setDiscordStatusEnabled={s.setDiscordStatusEnabled}
              hasIcon={s.hasIcon}
              setHasIcon={s.setHasIcon}
              onSaved={onSaved}
              onError={onError}
              onNotice={onNotice}
              onCopyAddress={() => void s.copyAddress()}
            />
          )}

          {s.category === "world" && (
            <SettingsWorldPanel
              server={server}
              props={s.props}
              setProp={s.setProp}
              settingsEditable={s.settingsEditable}
              onNotice={onNotice}
              onError={onError}
            />
          )}

          {s.category === "gameplay" && (
            <SettingsGameplayPanel
              props={s.props}
              setProp={s.setProp}
              settingsEditable={s.settingsEditable}
            />
          )}

          {s.category === "network" && (
            <SettingsNetworkPanel
              server={server}
              props={s.props}
              setProp={s.setProp}
              settingsEditable={s.settingsEditable}
              packInfo={s.packInfo}
              packBusy={s.packBusy}
              onUploadPack={(file) => void s.onUploadPack(file)}
              onDeletePack={() => void s.onDeletePack()}
              onNotice={onNotice}
              onError={onError}
              onSaved={onSaved}
              setConnect={s.setConnect}
            />
          )}

          {s.category === "performance" && (
            <SettingsPerformancePanel
              props={s.props}
              setProp={s.setProp}
              memoryMb={s.memoryMb}
              setMemoryMb={s.setMemoryMb}
              diskMb={s.diskMb}
              setDiskMb={s.setDiskMb}
              cpuLimit={s.cpuLimit}
              setCpuLimit={s.setCpuLimit}
              memoryCapMb={s.memoryCapMb}
              isAdmin={s.isAdmin}
              settingsEditable={s.settingsEditable}
              startupEditable={s.startupEditable}
            />
          )}

          {s.category === "startup" && (
            <SettingsStartupPanel
              server={server}
              javaVersion={s.javaVersion}
              setJavaVersion={s.setJavaVersion}
              serverJar={s.serverJar}
              setServerJar={s.setServerJar}
              startupCommand={s.startupCommand}
              setStartupCommand={s.setStartupCommand}
              startupEditable={s.startupEditable}
              settingsEditable={s.settingsEditable}
              extraMounts={s.extraMounts}
              setExtraMounts={s.setExtraMounts}
              isAdmin={s.isAdmin}
              isForgeType={s.isForgeType}
              jarOk={s.jarOk}
              startupPresets={s.startupPresets}
              resolvedStartupPreview={s.resolvedStartupPreview}
              heapCheck={s.heapCheck}
              memoryMb={s.memoryMb}
            />
          )}

          <Button
            type="submit"
            variant="primary"
            className="mt-2"
            disabled={
              s.saving ||
              !s.canSaveCategory ||
              (s.category === "startup" && s.startupEditable && (!s.jarOk || !s.heapCheck.ok))
            }
          >
            {s.saving ? s.t("settings.saving") : s.t("settings.save")}
          </Button>
        </Form>
      </Col>
    </Row>
  );
}
