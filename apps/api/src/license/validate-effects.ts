import { logActivity } from "../activity-log.js";
import { enforceUnlicensedFreeTier, getUnlicensedFreeTier } from "./license-quota.js";

let lastValid: boolean | null = null;

export function rememberLicenseValidity(valid: boolean): void {
  lastValid = valid;
}

export function wasLicenseValid(): boolean | null {
  return lastValid;
}

export async function maybeEnforceTransition(valid: boolean, message: string): Promise<void> {
  const was = lastValid;
  lastValid = valid;
  if (was === true && valid === false) {
    const stopped = await enforceUnlicensedFreeTier(message);
    logActivity({
      action: "license.expired",
      actor: "system",
      user: null,
      serverId: null,
      success: true,
      metadata: {
        message,
        stopped,
        freeTier: getUnlicensedFreeTier(),
      },
    });
  }
}
