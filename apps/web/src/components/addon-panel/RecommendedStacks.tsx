import { RECOMMENDED_PLUGIN_STACKS } from "@msm/shared";
import { Alert, Button, Spinner, Stack } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";

export function RecommendedStacks({
  serverId,
  busyId,
  stackBusy,
  setStackBusy,
  onError,
  onNotice,
  onInstalled,
}: {
  serverId: string;
  busyId: string | null;
  stackBusy: string | null;
  setStackBusy: (id: string | null) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onInstalled: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <Alert variant="light" className="border mb-3">
      <div className="fw-semibold mb-2">
        <i className="fa-solid fa-layer-group me-2" />
        {t("addons.recommendedStacks")}
      </div>
      <Stack gap={2}>
        {RECOMMENDED_PLUGIN_STACKS.map((stack) => (
          <div
            key={stack.id}
            className="d-flex flex-wrap justify-content-between align-items-start gap-2"
          >
            <div className="min-w-0">
              <div className="fw-semibold">{stack.name}</div>
              <div className="small text-secondary">{stack.description}</div>
              <div className="small text-secondary">
                {stack.items.map((i) => i.name).join(" · ")}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline-primary"
              disabled={stackBusy !== null || busyId !== null}
              onClick={() => {
                setStackBusy(stack.id);
                onError(null);
                void api
                  .installAddonStack(serverId, stack.id)
                  .then(async (res) => {
                    await onInstalled();
                    const errPart =
                      res.errors.length > 0
                        ? t("addons.stackErrors", {
                            count: res.errors.length,
                          })
                        : "";
                    onNotice(
                      t("addons.noticeStack", {
                        count: res.installed.length,
                        name: stack.name,
                        errors: errPart,
                      }),
                    );
                  })
                  .catch((err) =>
                    onError(err instanceof Error ? err.message : t("addons.stackInstallFailed")),
                  )
                  .finally(() => setStackBusy(null));
              }}
            >
              {stackBusy === stack.id ? <Spinner size="sm" /> : t("addons.install")}
            </Button>
          </div>
        ))}
      </Stack>
    </Alert>
  );
}
