import type { McServer, ServerDetail } from "@msm/shared";
import { TransferOwnerModal } from "../../components/TransferOwnerModal";
import { WhitelistStartModal } from "../../components/WhitelistStartModal";
import { WhitelistToggleModal } from "../../components/WhitelistToggleModal";

export function DashboardModals({
  whitelistPrompt,
  busyId,
  onClearWhitelistPrompt,
  onStartAnyway,
  onEnableAndStart,
  whitelistModal,
  whitelistModalBusy,
  onClearWhitelistModal,
  onWhitelistError,
  onWhitelistSaved,
  transferServer,
  onClearTransfer,
  onTransferred,
}: {
  whitelistPrompt: McServer | null;
  busyId: string | null;
  onClearWhitelistPrompt: () => void;
  onStartAnyway: () => void;
  onEnableAndStart: () => void;
  whitelistModal: ServerDetail | null;
  whitelistModalBusy: boolean;
  onClearWhitelistModal: () => void;
  onWhitelistError: (message: string | null) => void;
  onWhitelistSaved: (updated: ServerDetail) => void;
  transferServer: McServer | null;
  onClearTransfer: () => void;
  onTransferred: (updated: McServer) => void;
}) {
  return (
    <>
      {whitelistPrompt && (
        <WhitelistStartModal
          serverName={whitelistPrompt.name}
          busy={busyId === whitelistPrompt.id}
          onCancel={onClearWhitelistPrompt}
          onStartAnyway={onStartAnyway}
          onEnableAndStart={onEnableAndStart}
        />
      )}

      {whitelistModal && (
        <WhitelistToggleModal
          server={whitelistModal}
          busy={whitelistModalBusy}
          onCancel={onClearWhitelistModal}
          onError={onWhitelistError}
          onSaved={onWhitelistSaved}
        />
      )}

      {transferServer && (
        <TransferOwnerModal
          server={transferServer}
          onCancel={onClearTransfer}
          onTransferred={onTransferred}
        />
      )}
    </>
  );
}
