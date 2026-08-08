import { useState } from "react";
import { useI18n } from "../../../i18n/react";
import type { Dialog } from "./types";

export function useFileDialogs() {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  function askDiscard(onYes: () => void | Promise<void>) {
    setDialog({
      kind: "confirm",
      title: t("files.discardTitle"),
      body: t("files.discardBody"),
      confirmLabel: t("files.discard"),
      variant: "warning",
      onYes,
    });
  }

  async function runDialogAction(action: () => void | Promise<void>) {
    setDialogBusy(true);
    try {
      await action();
      setDialog(null);
    } finally {
      setDialogBusy(false);
    }
  }

  return {
    dialog,
    setDialog,
    dialogBusy,
    askDiscard,
    runDialogAction,
  };
}
