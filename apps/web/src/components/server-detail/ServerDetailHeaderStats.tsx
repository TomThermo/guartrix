import type { OnlinePlayersResponse, ServerDetail, ServerPermission } from "@guartrix/shared";
import { typeIcon, typeLabel } from "../../utils";
import type { TabId } from "./server-tabs";
import { ServerDetailStatChip } from "./ServerDetailStatChip";
import { useI18n } from "../../i18n/react";

type OnlineInfo = Pick<OnlinePlayersResponse, "playersOnline" | "playersMax"> | null;

export function ServerDetailHeaderStats({
  server,
  online,
  isAdmin,
  whitelistOn,
  supportsAddons,
  addonUpdateCount,
  can,
  onChangeTab,
  onShowWhitelistModal,
  onShowTransfer,
}: {
  server: ServerDetail;
  online: OnlineInfo;
  isAdmin: boolean;
  whitelistOn: boolean;
  supportsAddons: boolean;
  addonUpdateCount: number;
  can: (p: ServerPermission | ServerPermission[]) => boolean;
  onChangeTab: (tab: TabId) => void;
  onShowWhitelistModal: () => void;
  onShowTransfer: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="server-detail-header__stats">
      <ServerDetailStatChip
        icon={typeIcon(server.type)}
        label={typeLabel(server.type)}
        title={typeLabel(server.type)}
      />
      {(isAdmin || server.ownerUsername) && (
        <ServerDetailStatChip
          icon="fa-user"
          label={server.ownerUsername ?? t("serverDetail.unassigned")}
          title={isAdmin ? t("serverDetail.transferOwner") : t("serverDetail.owner")}
          onClick={isAdmin ? onShowTransfer : undefined}
        />
      )}
      {can("player.read") && (
        <ServerDetailStatChip
          icon="fa-users"
          label={
            online
              ? `${online.playersOnline}${online.playersMax > 0 ? `/${online.playersMax}` : ""}`
              : server.status === "RUNNING"
                ? "…/…"
                : "0/0"
          }
          title={t("serverDetail.onlinePlayersTitle")}
          onClick={() => onChangeTab("players")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChangeTab("players");
            }
          }}
        />
      )}
      {can("settings.read") && (
        <ServerDetailStatChip
          icon={whitelistOn ? "fa-shield-halved" : "fa-shield"}
          label={whitelistOn ? t("serverDetail.wlOn") : t("serverDetail.wlOff")}
          title={
            can("settings.update")
              ? t("serverDetail.clickWhitelist")
              : whitelistOn
                ? t("serverDetail.whitelistEnabled")
                : t("serverDetail.whitelistDisabled")
          }
          tone={whitelistOn ? "success" : "warning"}
          onClick={() => {
            if (can("settings.update")) onShowWhitelistModal();
            else onChangeTab("whitelist");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (can("settings.update")) onShowWhitelistModal();
              else onChangeTab("whitelist");
            }
          }}
        />
      )}
      {supportsAddons && can("addon.read") && (
        <ServerDetailStatChip
          icon="fa-puzzle-piece"
          label={
            addonUpdateCount > 0
              ? addonUpdateCount === 1
                ? t("common.updateOne", { count: addonUpdateCount })
                : t("common.updateMany", { count: addonUpdateCount })
              : t("serverDetail.upToDate")
          }
          title={t("serverDetail.openAddons")}
          tone={addonUpdateCount > 0 ? "danger" : "neutral"}
          onClick={() => onChangeTab("addons")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChangeTab("addons");
            }
          }}
        />
      )}
      {server.autoRestart && (
        <ServerDetailStatChip icon="fa-rotate" label={t("serverDetail.autoRestart")} tone="info" />
      )}
    </div>
  );
}
