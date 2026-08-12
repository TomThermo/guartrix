import {
  BEDROCK_SERVER_TYPES,
  JAVA_SERVER_TYPES,
  type DaemonNode,
  type ServerType,
  type SoftwareBuildInfo,
} from "@guartrix/shared";
import { Form } from "react-bootstrap";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import { typeIcon, typeLabel, formatGb } from "../../utils";

function TypePicker({
  label,
  types,
  selected,
  onSelect,
}: {
  label: string;
  types: ServerType[];
  selected: ServerType;
  onSelect: (type: ServerType) => void;
}) {
  return (
    <div className="create-type-group">
      <p className="create-type-group__label">{label}</p>
      <div className="create-type-grid" role="group" aria-label={label}>
        {types.map((st) => (
          <button
            key={st}
            type="button"
            className={`create-type-tile ${selected === st ? "is-active" : ""}`}
            aria-pressed={selected === st}
            onClick={() => onSelect(st)}
          >
            <i className={`fa-solid ${typeIcon(st)}`} aria-hidden />
            <span>{typeLabel(st)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type ServerTypeNodeFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
  nodes: DaemonNode[];
  nodeId: string;
  onNodeIdChange: (value: string) => void;
  selectedNode: DaemonNode | null;
  nodeRamOk: boolean;
  selectedFreeMb: number;
  memoryMb: number;
  type: ServerType;
  onTypeChange: (type: ServerType) => void;
  mcVersion: string;
  onMcVersionChange: (value: string) => void;
  versions: string[];
  loadingVersions: boolean;
  builds: SoftwareBuildInfo[];
  paperBuild: number | "";
  onPaperBuildChange: (value: number | "") => void;
  loadingBuilds: boolean;
};

export function ServerTypeNodeFields({
  name,
  onNameChange,
  nodes,
  nodeId,
  onNodeIdChange,
  selectedNode,
  nodeRamOk,
  selectedFreeMb,
  memoryMb,
  type,
  onTypeChange,
  mcVersion,
  onMcVersionChange,
  versions,
  loadingVersions,
  builds,
  paperBuild,
  onPaperBuildChange,
  loadingBuilds,
}: ServerTypeNodeFieldsProps) {
  const { t } = useI18n();
  const showBuild = type === "PAPER" || type === "PURPUR";

  return (
    <>
      <AdminPanelCard title={t("createServer.sectionDetails")} icon="fa-server">
        <Form.Group className="mb-3" controlId="name">
          <Form.Label>{t("createServer.name")}</Form.Label>
          <Form.Control
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            maxLength={64}
            placeholder={t("createServer.namePlaceholder")}
          />
        </Form.Group>

        <Form.Group className="mb-0" controlId="node">
          <Form.Label>{t("createServer.node")}</Form.Label>
          <Form.Select
            value={nodeId}
            onChange={(e) => onNodeIdChange(e.target.value)}
            required={nodes.length > 0}
            disabled={nodes.length === 0}
          >
            {nodes.length === 0 && <option value="">{t("createServer.noNodes")}</option>}
            {nodes.map((n, idx) => {
              const free = n.memoryUsableMb ?? n.memoryAvailableMb;
              const recommended =
                idx === 0 && n.status === "ONLINE" && (n.memoryMb <= 0 || free > 0);
              return (
                <option key={n.id} value={n.id}>
                  {n.name}
                  {n.location ? ` (${n.location})` : ""}
                  {n.isLocal ? ` ${t("createServer.localSuffix")}` : ""}
                  {recommended ? ` ${t("createServer.recommended")}` : ""}
                  {n.memoryMb > 0
                    ? t("createServer.nodeOptionUsable", {
                        free: formatGb(free),
                        total: formatGb(n.memoryMb),
                      })
                    : ""}
                  {n.status !== "ONLINE" ? ` [${n.status}]` : ""}
                </option>
              );
            })}
          </Form.Select>
          {selectedNode && (
            <div className={`create-server-node-meta ${nodeRamOk ? "text-secondary" : "is-error"}`}>
              {selectedNode.memoryMb > 0
                ? nodeRamOk
                  ? t("createServer.nodeHasUsable", {
                      free: formatGb(selectedFreeMb),
                      reserved: formatGb(selectedNode.memoryReserveMb ?? 0),
                      used: formatGb(selectedNode.memoryUsedMb),
                      total: formatGb(selectedNode.memoryMb),
                    })
                  : t("createServer.notEnoughRamDetail", {
                      requested: formatGb(memoryMb),
                      usable: formatGb(selectedFreeMb),
                    })
                : t("createServer.nodeCapacityUnknown")}
            </div>
          )}
        </Form.Group>
      </AdminPanelCard>

      <AdminPanelCard title={t("createServer.sectionSoftware")} icon="fa-cube">
        <TypePicker
          label={t("createServer.typeJava")}
          types={JAVA_SERVER_TYPES}
          selected={type}
          onSelect={onTypeChange}
        />
        <TypePicker
          label={t("createServer.typeBedrock")}
          types={BEDROCK_SERVER_TYPES}
          selected={type}
          onSelect={onTypeChange}
        />
        <Form.Group className={`mt-3 ${showBuild ? "mb-3" : "mb-0"}`} controlId="version">
          <Form.Label>{t("createServer.version")}</Form.Label>
          <Form.Select
            value={mcVersion}
            onChange={(e) => onMcVersionChange(e.target.value)}
            disabled={loadingVersions || versions.length === 0}
            required
          >
            {loadingVersions && <option>{t("common.loading")}…</option>}
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        {showBuild && (
          <Form.Group className="mb-0" controlId="paper-build">
            <Form.Label>{t("createServer.build")}</Form.Label>
            <Form.Select
              value={paperBuild === "" ? "" : String(paperBuild)}
              onChange={(e) => {
                const v = e.target.value;
                onPaperBuildChange(v === "" ? "" : Number(v));
              }}
              disabled={loadingBuilds || builds.length === 0 || !mcVersion}
              required={builds.length > 0}
            >
              {loadingBuilds && <option>{t("common.loading")}…</option>}
              {!loadingBuilds && builds.length === 0 && (
                <option value="">{t("createServer.buildNone")}</option>
              )}
              {builds.map((b) => (
                <option key={b.id} value={b.id}>
                  {t("createServer.buildOption", { id: b.id, channel: b.channel })}
                </option>
              ))}
            </Form.Select>
            <Form.Text className="text-secondary">{t("createServer.buildHelp")}</Form.Text>
          </Form.Group>
        )}
      </AdminPanelCard>
    </>
  );
}
