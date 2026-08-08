import { Alert } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatGb, usagePct, type LicenseInfo } from "./licenseShared";
import { UsageMeter } from "./UsageMeter";

export function LicenseUsagePanel({ info }: { info: LicenseInfo }) {
  const { t } = useI18n();
  const usage = info.usage;
  const nodesPct = usagePct(usage?.nodeCount ?? 0, info.maxNodes);
  const serversPct = usagePct(usage?.serverCount ?? 0, info.maxServers);
  const ramPct = usagePct(usage?.memoryUsedMb ?? 0, info.maxMemoryMb);
  const perServerPct = usagePct(usage?.maxServerMemoryMb ?? 0, info.maxMemoryMbPerServer);

  return (
    <section className="license-panel mt-3">
      <div className="d-flex align-items-baseline justify-content-between gap-2 mb-2">
        <h2 className="h6 mb-0">{info.freeTier ? "Free-tier usage" : "License usage"}</h2>
        <span className="small text-secondary">Allowance vs in use</span>
      </div>

      <div className="license-meters">
        <UsageMeter
          label="Nodes"
          usedLabel={`${usage?.nodeCount ?? 0} / ${info.maxNodes != null ? info.maxNodes : "∞"}`}
          pct={nodesPct}
          capped={info.maxNodes != null}
          uncappedHint={t("common.unlimited")}
        />
        <UsageMeter
          label="Servers"
          usedLabel={`${usage?.serverCount ?? 0} / ${info.maxServers != null ? info.maxServers : "∞"}`}
          pct={serversPct}
          capped={info.maxServers != null}
          uncappedHint={t("common.unlimited")}
        />
        <UsageMeter
          label="Total RAM"
          usedLabel={`${formatGb(usage?.memoryUsedMb ?? 0)} / ${
            info.maxMemoryMb != null ? formatGb(info.maxMemoryMb) : info.freeTier ? "—" : "∞"
          }`}
          pct={ramPct}
          capped={info.maxMemoryMb != null}
          uncappedHint={info.freeTier ? "No RAM pool cap" : t("common.unlimited")}
        />
        <UsageMeter
          label={info.freeTier ? "Disk / server" : "Largest server"}
          usedLabel={
            info.freeTier
              ? `≤${(info.maxDiskMb ?? 10_240) / 1024} GB`
              : `${formatGb(usage?.maxServerMemoryMb ?? 0)} / ${
                  info.maxMemoryMbPerServer != null
                    ? `≤${formatGb(info.maxMemoryMbPerServer)}`
                    : "∞"
                }`
          }
          pct={info.freeTier ? 0 : perServerPct}
          capped={!info.freeTier && info.maxMemoryMbPerServer != null}
          uncappedHint={
            info.freeTier ? `Max ${(info.maxDiskMb ?? 10_240) / 1024} GB` : "No per-server cap"
          }
        />
      </div>

      {info.freeTier && (
        <Alert variant="warning" className="small mb-0 mt-3 py-2">
          Extra or over-disk servers are stopped until you activate a license.
        </Alert>
      )}
      {!info.freeTier &&
        info.maxMemoryMbPerServer != null &&
        (usage?.maxServerMemoryMb ?? 0) > info.maxMemoryMbPerServer && (
          <Alert variant="warning" className="small mb-0 mt-3 py-2">
            At least one server is above the per-server RAM cap. Lower Memory in server settings
            before start/restart.
          </Alert>
        )}
    </section>
  );
}
