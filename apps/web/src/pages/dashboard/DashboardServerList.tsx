import type { McServer, OnlinePlayersResponse, ServerStats, ServerUpdateInfo } from "@guartrix/shared";
import { Button } from "react-bootstrap";
import { DashboardServerRow } from "../../components/DashboardServerRow";
import { useI18n } from "../../i18n/react";
import { DashboardBulkToolbar } from "./DashboardBulkToolbar";

export function DashboardServerList({
  filtered,
  servers,
  serverTotal,
  statsMap,
  onlineMap,
  updatesMap,
  addonUpdatesMap,
  canWrite,
  isAdmin,
  busyId,
  bulkBusy,
  selectedIds,
  allFilteredSelected,
  whitelistModalBusy,
  loadingMore,
  statusLabel,
  onToggleSelected,
  onToggleSelectAll,
  onBulkAct,
  onRequestStart,
  onStop,
  onRestart,
  onTransfer,
  onOpenWhitelistModal,
  onLoadMore,
}: {
  filtered: McServer[];
  servers: McServer[];
  serverTotal: number;
  statsMap: Record<string, ServerStats>;
  onlineMap: Record<string, OnlinePlayersResponse>;
  updatesMap: Record<string, ServerUpdateInfo>;
  addonUpdatesMap: Record<string, { available: number }>;
  canWrite: boolean;
  isAdmin: boolean;
  busyId: string | null;
  bulkBusy: boolean;
  selectedIds: Set<string>;
  allFilteredSelected: boolean;
  whitelistModalBusy: boolean;
  loadingMore: boolean;
  statusLabel: (status: McServer["status"]) => string;
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: () => void;
  onBulkAct: (action: "start" | "stop" | "restart") => void;
  onRequestStart: (server: McServer) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onTransfer: (server: McServer) => void;
  onOpenWhitelistModal: (id: string) => void;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {canWrite && (
        <DashboardBulkToolbar
          allFilteredSelected={allFilteredSelected}
          selectedCount={selectedIds.size}
          bulkBusy={bulkBusy}
          onToggleSelectAll={onToggleSelectAll}
          onBulkAct={onBulkAct}
        />
      )}
      <div className="server-list">
        {filtered.map((s) => (
          <DashboardServerRow
            key={s.id}
            server={s}
            stats={statsMap[s.id]}
            online={onlineMap[s.id]}
            update={updatesMap[s.id]}
            addonUpdates={addonUpdatesMap[s.id]}
            canWrite={canWrite}
            isAdmin={isAdmin}
            busyId={busyId}
            bulkBusy={bulkBusy}
            selected={selectedIds.has(s.id)}
            onToggleSelected={() => onToggleSelected(s.id)}
            whitelistModalBusy={whitelistModalBusy}
            statusLabel={statusLabel}
            onRequestStart={onRequestStart}
            onStop={onStop}
            onRestart={onRestart}
            onTransfer={onTransfer}
            onOpenWhitelistModal={onOpenWhitelistModal}
          />
        ))}
      </div>
      {servers.length < serverTotal && (
        <div className="d-flex justify-content-center mt-3">
          <Button variant="outline-secondary" size="sm" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore
              ? t("common.loading")
              : t("dashboard.loadMore", {
                  loaded: servers.length,
                  total: serverTotal,
                })}
          </Button>
        </div>
      )}
    </>
  );
}
