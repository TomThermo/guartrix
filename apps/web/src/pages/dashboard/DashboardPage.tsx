import { Alert } from "react-bootstrap";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardModals } from "./DashboardModals";
import { DashboardServerList } from "./DashboardServerList";
import { useDashboardPage } from "./useDashboardPage";

export function DashboardPage() {
  const s = useDashboardPage();

  return (
    <AdminPageShell
      title={s.t("dashboard.title")}
      subtitle={s.t("dashboard.subtitle")}
      icon="fa-server"
      loading={s.loading}
      loadingLabel={s.t("common.loading")}
      error={s.error}
      onDismissError={() => s.setError(null)}
      extraHeader={null}
    >
      {!s.canCreate && s.canWrite && s.user?.maxServers != null && s.user.maxServers > 0 && (
        <Alert variant="secondary">
          {s.t("dashboard.serverLimit", {
            count: s.user.serverCount ?? 0,
            max: s.user.maxServers,
          })}
        </Alert>
      )}
      <DashboardModals
        whitelistPrompt={s.whitelistPrompt}
        busyId={s.busyId}
        onClearWhitelistPrompt={() => s.setWhitelistPrompt(null)}
        onStartAnyway={() => void s.act(s.whitelistPrompt!.id, "start")}
        onEnableAndStart={() => void s.act(s.whitelistPrompt!.id, "start", true)}
        whitelistModal={s.whitelistModal}
        whitelistModalBusy={s.whitelistModalBusy}
        onClearWhitelistModal={() => s.setWhitelistModal(null)}
        onWhitelistError={(message) => s.setError(message)}
        onWhitelistSaved={s.onWhitelistSaved}
        transferServer={s.transferServer}
        onClearTransfer={() => s.setTransferServer(null)}
        onTransferred={s.onTransferred}
      />

      {s.servers.length === 0 ? (
        <DashboardEmptyState canCreate={s.canCreate} />
      ) : (
        <>
          <DashboardFilters
            query={s.query}
            onQueryChange={s.setQuery}
            statusFilter={s.statusFilter}
            onStatusFilterChange={s.setStatusFilter}
            nodeFilter={s.nodeFilter}
            onNodeFilterChange={s.setNodeFilter}
            typeFilter={s.typeFilter}
            onTypeFilterChange={s.setTypeFilter}
            nodeOptions={s.nodeOptions}
            typeOptions={s.typeOptions}
            filteredCount={s.filtered.length}
            totalCount={s.servers.length}
          />
          {s.filtered.length === 0 ? (
            <Alert variant="secondary">{s.t("dashboard.noMatch")}</Alert>
          ) : (
            <DashboardServerList
              filtered={s.filtered}
              servers={s.servers}
              serverTotal={s.serverTotal}
              statsMap={s.statsMap}
              onlineMap={s.onlineMap}
              updatesMap={s.updatesMap}
              addonUpdatesMap={s.addonUpdatesMap}
              canWrite={s.canWrite}
              isAdmin={s.isAdmin}
              busyId={s.busyId}
              bulkBusy={s.bulkBusy}
              selectedIds={s.selectedIds}
              allFilteredSelected={s.allFilteredSelected}
              whitelistModalBusy={s.whitelistModalBusy}
              loadingMore={s.loadingMore}
              statusLabel={s.statusLabel}
              onToggleSelected={s.toggleSelected}
              onToggleSelectAll={s.toggleSelectAllFiltered}
              onBulkAct={(action) => void s.bulkAct(action)}
              onRequestStart={s.requestStart}
              onStop={(id) => void s.act(id, "stop")}
              onRestart={(id) => void s.act(id, "restart")}
              onTransfer={s.setTransferServer}
              onOpenWhitelistModal={(id) => void s.openWhitelistModal(id)}
              onLoadMore={() => void s.loadMoreServers()}
            />
          )}
        </>
      )}
    </AdminPageShell>
  );
}
