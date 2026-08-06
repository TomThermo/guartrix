import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Reject shell metacharacters outside known placeholders in operator templates. */
function assertSafeOffsiteTemplate(template: string): void {
  const stripped = template
    .replaceAll("{path}", "")
    .replaceAll("{serverId}", "")
    .replaceAll("{backupId}", "")
    .replaceAll("{fileName}", "");
  if (/[;|&$`<>]/.test(stripped)) {
    throw new Error(
      "BACKUP_OFFSITE_CMD contains disallowed shell metacharacters outside placeholders",
    );
  }
}

/**
 * Optional offsite copy after a successful backup.
 * Set BACKUP_OFFSITE_CMD to a shell command; placeholders:
 *   {path} {serverId} {backupId} {fileName}
 * Example: rclone copy "{path}" b2:guartrix-backups/{serverId}/
 */
export async function runOffsiteBackupHook(opts: {
  archivePath: string;
  serverId: string;
  backupId: string;
  fileName: string;
}): Promise<void> {
  const template = config.backupOffsiteCmd?.trim();
  if (!template) return;
  assertSafeOffsiteTemplate(template);
  const cmd = template
    .replaceAll("{path}", shellSingleQuote(opts.archivePath))
    .replaceAll("{serverId}", shellSingleQuote(opts.serverId))
    .replaceAll("{backupId}", shellSingleQuote(opts.backupId))
    .replaceAll("{fileName}", shellSingleQuote(opts.fileName));
  try {
    await execFileAsync("bash", ["-c", cmd], {
      timeout: 10 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    logger.info(
      { serverId: opts.serverId, backupId: opts.backupId },
      "offsite backup hook completed",
    );
  } catch (err) {
    logger.warn(
      { err, serverId: opts.serverId, backupId: opts.backupId },
      "offsite backup hook failed",
    );
  }
}
