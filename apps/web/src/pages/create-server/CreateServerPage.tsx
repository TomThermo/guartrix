import { Navigate } from "react-router-dom";
import { Form, Nav } from "react-bootstrap";
import { AdminInsetCard, AdminPageShell } from "../../components/admin/AdminPageShell";
import { CreateServerForm } from "./CreateServerForm";
import { CreateServerResourcesCard } from "./CreateServerResourcesCard";
import { CreateServerSubmitButton } from "./CreateServerSubmitButton";
import { ImportServerForm } from "./ImportServerForm";
import { ServerTypeNodeFields } from "./ServerTypeNodeFields";
import { useCreateServerPage, type CreateServerMode } from "./useCreateServerPage";

export function CreateServerPage() {
  const s = useCreateServerPage();
  const { t } = s;

  const quotaChips =
    s.serversLeft != null || s.remainingRamMb != null ? (
      <div className="create-server-quota">
        {s.serversLeft != null && (
          <span className="account-status-chip is-off">
            {s.serversLeft === 1
              ? t("createServer.quotaServersLeft", { count: s.serversLeft })
              : t("createServer.quotaServersLeftPlural", { count: s.serversLeft })}
          </span>
        )}
        {s.remainingRamMb != null && (
          <span className="account-status-chip is-off">
            {t("createServer.quotaRamLeft", {
              gb: (s.remainingRamMb / 1024).toFixed(s.remainingRamMb % 1024 === 0 ? 0 : 1),
            })}
          </span>
        )}
      </div>
    ) : null;

  if (!s.allowed) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminPageShell
      className="create-server-page"
      title={t("createServer.title")}
      subtitle={t("createServer.subtitle")}
      icon="fa-plus"
      backTo="/"
      backLabel={t("common.cancel")}
      error={s.error}
      onDismissError={() => s.setError(null)}
    >
      {quotaChips}

      <Nav
        variant="pills"
        className="create-server-mode-nav"
        activeKey={s.mode}
        onSelect={(k) => k && s.setMode(k as CreateServerMode)}
      >
        <Nav.Item>
          <Nav.Link eventKey="create">
            <i className="fa-solid fa-plus" aria-hidden />
            {t("createServer.modeCreate")}
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="import">
            <i className="fa-solid fa-file-import" aria-hidden />
            {t("createServer.modeImport")}
          </Nav.Link>
        </Nav.Item>
      </Nav>

      <Form onSubmit={(e) => void (s.mode === "create" ? s.onCreate(e) : s.onImport(e))}>
        <div className="create-server-layout">
          <div className="create-server-stack">
            {s.mode === "import" && <ImportServerForm onArchiveChange={s.setArchive} />}
            <ServerTypeNodeFields
              name={s.name}
              onNameChange={s.setName}
              nodes={s.nodes}
              nodeId={s.nodeId}
              onNodeIdChange={s.setNodeId}
              selectedNode={s.selectedNode}
              nodeRamOk={s.nodeRamOk}
              selectedFreeMb={s.selectedFreeMb}
              memoryMb={s.memoryMb}
              type={s.type}
              onTypeChange={s.setType}
              mcVersion={s.mcVersion}
              onMcVersionChange={s.setMcVersion}
              versions={s.versions}
              loadingVersions={s.loadingVersions}
            />
            {s.mode === "create" && (
              <CreateServerForm
                worldPreset={s.worldPreset}
                onWorldPresetChange={s.setWorldPreset}
                seed={s.seed}
                onSeedChange={s.setSeed}
                gamemode={s.gamemode}
                onGamemodeChange={s.setGamemode}
                difficulty={s.difficulty}
                onDifficultyChange={s.setDifficulty}
              />
            )}
          </div>

          <div className="create-server-side">
            <CreateServerResourcesCard
              port={s.port}
              onPortChange={(p) => {
                s.setPortManuallyEdited(true);
                s.setPort(p);
              }}
              portError={s.portError}
              portChecking={s.portChecking}
              portManuallyEdited={s.portManuallyEdited}
              nodeId={s.nodeId}
              memoryMb={s.memoryMb}
              onMemoryMbChange={s.setMemoryMb}
              diskMb={s.diskMb}
              onDiskMbChange={s.setDiskMb}
              keepCount={s.keepCount}
              onKeepCountChange={s.setKeepCount}
              cpuLimit={s.cpuLimit}
              onCpuLimitChange={s.setCpuLimit}
              remainingRamMb={s.remainingRamMb}
              selectedNode={s.selectedNode}
              selectedFreeMb={s.selectedFreeMb}
            />
            <AdminInsetCard className="create-server-submit">
              <CreateServerSubmitButton
                mode={s.mode}
                busy={s.busy}
                disabled={s.submitDisabled}
                type={s.type}
              />
            </AdminInsetCard>
          </div>
        </div>
      </Form>
    </AdminPageShell>
  );
}
