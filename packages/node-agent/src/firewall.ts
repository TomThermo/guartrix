import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const COMMENT = "Guartrix";

export const firewallEnabled =
  (process.env.MANAGE_FIREWALL ?? "true").toLowerCase() !== "false";

async function runUfw(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("sudo", ["-n", "ufw", ...args], {
      timeout: 15_000,
      env: process.env,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join(" | ");
    throw new Error(`UFW failed (${args.join(" ")}): ${detail}`);
  }
}

function assertValidPort(port: number): void {
  if (port < 1024 || port > 65535) {
    throw new Error(`Invalid firewall port: ${port}`);
  }
}

/** Basic IPv4 / CIDR check for ufw `from` sources (no shell metacharacters). */
function assertSafeFromSource(from: string): string {
  const t = from.trim();
  if (!/^[0-9a-fA-F.:/]+$/.test(t) || t.length > 64) {
    throw new Error(`Invalid firewall source: ${from}`);
  }
  return t;
}

export async function openFirewallPort(
  port: number,
  protocol: "tcp" | "udp" = "tcp",
  opts?: { from?: string },
): Promise<void> {
  if (!firewallEnabled) return;
  assertValidPort(port);
  const proto = protocol === "udp" ? "udp" : "tcp";
  if (opts?.from) {
    const from = assertSafeFromSource(opts.from);
    // Restrict to a single source (e.g. panel IP → daemon API).
    await runUfw([
      "allow",
      "from",
      from,
      "to",
      "any",
      "port",
      String(port),
      "proto",
      proto,
      "comment",
      COMMENT,
    ]);
    return;
  }
  // Idempotent: ufw allow on an existing rule is fine
  await runUfw(["allow", `${port}/${proto}`, "comment", COMMENT]);
}

export async function closeFirewallPort(
  port: number,
  protocol: "tcp" | "udp" = "tcp",
): Promise<void> {
  if (!firewallEnabled) return;
  if (port < 1024 || port > 65535) return;

  const proto = protocol === "udp" ? "udp" : "tcp";
  // Prefer deleting by exact rule; ignore if rule missing
  try {
    await runUfw(["--force", "delete", "allow", `${port}/${proto}`]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Could not delete|nonexistent|not found|Skipping/i.test(message)) {
      return;
    }
    // ufw sometimes returns non-zero even when rule is gone — check status
    const { stdout } = await runUfw(["status"]);
    if (!stdout.includes(`${port}/${proto}`)) return;
    throw err;
  }
}

export async function changeFirewallPort(
  oldPort: number,
  newPort: number,
): Promise<void> {
  if (!firewallEnabled) return;
  if (oldPort === newPort) return;
  await openFirewallPort(newPort);
  await closeFirewallPort(oldPort);
}
