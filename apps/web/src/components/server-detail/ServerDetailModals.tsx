import type { ServerDetail } from "@guartrix/shared";
import { CloneServerModal } from "../CloneServerModal";
import { ChangeTypeModal } from "../ChangeTypeModal";
import { ReinstallServerModal } from "../ReinstallServerModal";
import { DeleteServerModal } from "../DeleteServerModal";
import { VersionPickerModal } from "../VersionPickerModal";
import { WhitelistStartModal } from "../WhitelistStartModal";
import { WhitelistToggleModal } from "../WhitelistToggleModal";
import { KillServerModal } from "../KillServerModal";
import { TransferOwnerModal } from "../TransferOwnerModal";
import { TransferNodeModal } from "../TransferNodeModal";
import { typeLabel } from "../../utils";

export function ServerDetailModals({
  server,
  busy,
  whitelistPrompt,
  showWhitelistModal,
  killPrompt,
  showClone,
  showReinstall,
  showChangeType,
  showVersionPicker,
  showTransfer,
  showNodeTransfer,
  showDelete,
  onSetWhitelistPrompt,
  onSetShowWhitelistModal,
  onSetKillPrompt,
  onSetShowClone,
  onSetShowReinstall,
  onSetShowChangeType,
  onSetShowVersionPicker,
  onSetShowTransfer,
  onSetShowNodeTransfer,
  onSetShowDelete,
  onAct,
  onSetServer,
  onSetError,
  onSetNotice,
  onRefreshUser,
  onNavigate,
  onLoad,
}: {
  server: ServerDetail;
  busy: boolean;
  whitelistPrompt: boolean;
  showWhitelistModal: boolean;
  killPrompt: boolean;
  showClone: boolean;
  showReinstall: boolean;
  showChangeType: boolean;
  showVersionPicker: boolean;
  showTransfer: boolean;
  showNodeTransfer: boolean;
  showDelete: boolean;
  onSetWhitelistPrompt: (v: boolean) => void;
  onSetShowWhitelistModal: (v: boolean) => void;
  onSetKillPrompt: (v: boolean) => void;
  onSetShowClone: (v: boolean) => void;
  onSetShowReinstall: (v: boolean) => void;
  onSetShowChangeType: (v: boolean) => void;
  onSetShowVersionPicker: (v: boolean) => void;
  onSetShowTransfer: (v: boolean) => void;
  onSetShowNodeTransfer: (v: boolean) => void;
  onSetShowDelete: (v: boolean) => void;
  onAct: (action: "start" | "stop" | "restart" | "kill", enableWhitelist?: boolean) => void;
  onSetServer: (
    updater: ServerDetail | ((prev: ServerDetail | null) => ServerDetail | null),
  ) => void;
  onSetError: (message: string | null) => void;
  onSetNotice: (message: string | null) => void;
  onRefreshUser: () => Promise<unknown>;
  onNavigate: (path: string) => void;
  onLoad: () => Promise<void>;
}) {
  return (
    <>
      {whitelistPrompt && (
        <WhitelistStartModal
          serverName={server.name}
          busy={busy}
          onCancel={() => onSetWhitelistPrompt(false)}
          onStartAnyway={() => void onAct("start")}
          onEnableAndStart={() => void onAct("start", true)}
        />
      )}

      {showWhitelistModal && (
        <WhitelistToggleModal
          server={server}
          busy={busy}
          onCancel={() => onSetShowWhitelistModal(false)}
          onError={(message) => onSetError(message)}
          onSaved={(updated) => {
            onSetServer(updated);
            onSetShowWhitelistModal(false);
            onSetNotice(
              updated.properties["white-list"] === "true"
                ? "Whitelist enabled."
                : "Whitelist disabled.",
            );
          }}
        />
      )}

      {killPrompt && (
        <KillServerModal
          serverName={server.name}
          busy={busy}
          onCancel={() => onSetKillPrompt(false)}
          onConfirm={() => void onAct("kill")}
        />
      )}

      {showClone && (
        <CloneServerModal
          server={server}
          busy={busy}
          onCancel={() => onSetShowClone(false)}
          onCloned={async (cloned) => {
            onSetShowClone(false);
            await onRefreshUser().catch(() => undefined);
            onSetNotice(`Cloned as ${cloned.name}`);
            onNavigate(`/servers/${cloned.id}`);
          }}
        />
      )}

      {showReinstall && (
        <ReinstallServerModal
          server={server}
          busy={busy}
          onCancel={() => onSetShowReinstall(false)}
          onDone={(next) => {
            onSetServer((prev) => (prev ? { ...prev, ...next } : prev));
            onSetShowReinstall(false);
            onSetNotice("Server reinstalled.");
          }}
        />
      )}

      {showChangeType && (
        <ChangeTypeModal
          server={server}
          busy={busy}
          onCancel={() => onSetShowChangeType(false)}
          onDone={(next) => {
            onSetServer((prev) => (prev ? { ...prev, ...next } : prev));
            onSetShowChangeType(false);
            onSetNotice(`Software changed to ${typeLabel(next.type)}.`);
          }}
        />
      )}

      {showVersionPicker && (
        <VersionPickerModal
          show={showVersionPicker}
          server={server}
          onHide={() => onSetShowVersionPicker(false)}
          onUpdated={(s) => {
            onSetServer((prev) => (prev ? { ...prev, ...s } : prev));
          }}
          onError={onSetError}
          onNotice={onSetNotice}
        />
      )}

      {showTransfer && (
        <TransferOwnerModal
          server={server}
          onCancel={() => onSetShowTransfer(false)}
          onTransferred={(updated) => {
            onSetServer((prev) => (prev ? { ...prev, ...updated } : prev));
            onSetShowTransfer(false);
            onSetNotice(
              updated.ownerUsername
                ? `Owner set to ${updated.ownerUsername}.`
                : "Owner cleared (unassigned).",
            );
          }}
        />
      )}

      {showNodeTransfer && (
        <TransferNodeModal
          server={server}
          busy={busy}
          onCancel={() => onSetShowNodeTransfer(false)}
          onTransferred={(updated) => {
            onSetServer((prev) => (prev ? { ...prev, ...updated } : prev));
            if (updated.status !== "TRANSFERRING") {
              onSetShowNodeTransfer(false);
              if (updated.status === "ERROR") {
                onSetError(updated.errorMessage ?? "Transfer failed");
              } else {
                onSetNotice(
                  `Moved to ${updated.nodeName ?? "new node"}${
                    updated.port !== server.port ? ` (port ${updated.port})` : ""
                  }.`,
                );
              }
              void onLoad();
            }
          }}
        />
      )}

      {showDelete && (
        <DeleteServerModal
          serverId={server.id}
          serverName={server.name}
          onCancel={() => onSetShowDelete(false)}
          onDeleted={() => {
            onSetShowDelete(false);
            onNavigate("/");
          }}
        />
      )}
    </>
  );
}
