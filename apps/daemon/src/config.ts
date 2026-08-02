import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../../");

dotenv.config({ path: path.join(rootDir, ".env") });
// Panel writes data/daemon.env on bootstrap — prefer those values when unset
dotenv.config({ path: path.join(rootDir, "data/daemon.env") });

function readProductVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(rootDir, "VERSION"), "utf8").trim();
    const v = raw.split(/\s/)[0];
    if (v) return v;
  } catch {
    /* ignore */
  }
  return "1.0.0";
}

const token = process.env.DAEMON_TOKEN?.trim();
if (!token) {
  throw new Error(
    "DAEMON_TOKEN is required — set it in .env or data/daemon.env (start the panel once to bootstrap)",
  );
}

export const daemonConfig = {
  host: process.env.DAEMON_HOST ?? "127.0.0.1",
  port: Number(process.env.DAEMON_PORT ?? 8081),
  token,
  /** Stable node id from panel (`DAEMON_NODE_ID`) — used to verify JWT `nid`. */
  nodeId:
    process.env.DAEMON_NODE_ID?.trim() ||
    process.env.NODE_ID?.trim() ||
    null,
  version: readProductVersion(),
  rootDir,
};
