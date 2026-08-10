import fs from "node:fs/promises";
import type { ServerType } from "@guartrix/shared";
import path from "node:path";
import { logActivity } from "../activity-log.js";
import { closeFirewallPort } from "../nodes/firewall.js";
import { prepareServerFiles } from "../providers/jars.js";
import { updateServerProperties } from "../servers/properties.js";
import { safeExtractArchive } from "@guartrix/node-agent";
import { syncLocalDirToNode, wipeServerEverywhere } from "../servers/server-files.js";
import { serverListInclude } from "../servers/serialize.js";
import { deleteServer, findServer, updateServer } from "./servers.js";

export type ImportBackgroundOpts = {
  id: string;
  nodeId: string;
  port: number;
  protocol: "tcp" | "udp";
  type: ServerType;
  mcVersion: string;
  dir: string;
  tmpArchive: string;
  uploadFilename: string;
  keepCount?: number;
  actor: { id: string; username: string };
};

/** Background job after POST /api/servers/import accepted the archive. */
export async function runImportInBackground(opts: ImportBackgroundOpts): Promise<void> {
  const { id, nodeId, port, protocol, dir, tmpArchive } = opts;
  const { setCreatingProgress, autoStartProvisionedServer } = await import(
    "../servers/server-provision.js"
  );
  try {
    await setCreatingProgress(id, "Creating: extracting archive…");
    await safeExtractArchive(tmpArchive, dir);
    await fs.rm(tmpArchive, { force: true });

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const meaningful = entries.filter((e) => !e.name.startsWith("import-upload"));
    if (meaningful.length === 1 && meaningful[0]!.isDirectory()) {
      const only = path.join(dir, meaningful[0]!.name);
      const inner = await fs.readdir(only);
      const hasServerRoot = inner.some(
        (n) => n === "server.properties" || n === "world" || n === "server.jar" || n === "run.sh",
      );
      if (hasServerRoot || inner.length > 0) {
        for (const name of inner) {
          await fs.rename(path.join(only, name), path.join(dir, name));
        }
        await fs.rm(only, { recursive: true, force: true });
      }
    }

    const hasJar =
      (await fs
        .access(path.join(dir, "server.jar"))
        .then(() => true)
        .catch(() => false)) ||
      (await fs
        .access(path.join(dir, "run.sh"))
        .then(() => true)
        .catch(() => false));

    let paperBuild: number | null = null;
    let fabricLoaderVersion: string | null = null;
    let forgeVersion: string | null = null;

    if (!hasJar) {
      await setCreatingProgress(id, "Creating: downloading server files…");
      const prepared = await prepareServerFiles(opts.type, opts.mcVersion, dir, port);
      paperBuild = prepared.paperBuild ?? null;
      fabricLoaderVersion = prepared.fabricLoaderVersion ?? null;
      forgeVersion = prepared.forgeVersion ?? null;
    } else {
      await fs.writeFile(path.join(dir, "eula.txt"), "eula=true\n", "utf8").catch(() => undefined);
    }

    await fs.rm(path.join(dir, "session.lock"), { force: true }).catch(() => undefined);
    await setCreatingProgress(id, "Creating: deploying to node…");
    await syncLocalDirToNode(id, nodeId, dir);
    await updateServerProperties(id, {}, port);

    const updated = await updateServer({
      where: { id },
      data: {
        paperBuild,
        fabricLoaderVersion,
        forgeVersion,
      },
      include: serverListInclude,
    });
    logActivity({
      action: "server.import",
      user: opts.actor,
      server: updated,
      metadata: {
        archive: opts.uploadFilename,
        type: updated.type,
        mcVersion: updated.mcVersion,
        port: updated.port,
        node: nodeId,
      },
    });
    const { applyInitialBackupRetention } = await import("../servers/backup-schedule.js");
    await applyInitialBackupRetention(updated.id, opts.keepCount);
    await setCreatingProgress(id, "Creating: starting…");
    await autoStartProvisionedServer(updated.id);
    const after = await findServer({
      where: { id },
      select: { status: true, errorMessage: true },
    });
    if (after?.status === "CREATING") {
      await updateServer({
        where: { id },
        data: { status: "STOPPED", errorMessage: null },
      });
    } else if (after?.errorMessage?.startsWith("Creating:")) {
      await updateServer({
        where: { id },
        data: { errorMessage: null },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[guartrix] background import failed for ${id}: ${message}`);
    await updateServer({
      where: { id },
      data: { status: "ERROR", errorMessage: message },
    }).catch(() => undefined);
    await wipeServerEverywhere(id).catch(() => undefined);
    await deleteServer({ where: { id } }).catch(() => undefined);
    await closeFirewallPort(port, nodeId, protocol).catch(() => undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
