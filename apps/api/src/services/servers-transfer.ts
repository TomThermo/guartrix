import type { AuthUser } from "@guartrix/shared";
import { serverListInclude, toMcServer } from "../servers/serialize.js";
import { getTransferJob, startServerTransfer } from "../servers/transfer.js";
import { findServerOrThrow } from "./servers.js";

export { getTransferJob, startServerTransfer };
export type { StartTransferInput } from "../servers/transfer/start.js";

export async function initiateServerTransfer(input: {
  serverId: string;
  toNodeId: string;
  port?: number;
  startAfter?: boolean;
  actor: AuthUser;
}) {
  const job = await startServerTransfer({
    serverId: input.serverId,
    toNodeId: input.toNodeId,
    port: input.port,
    startAfter: input.startAfter,
    actor: input.actor,
  });
  const updated = await findServerOrThrow({
    where: { id: input.serverId },
    include: serverListInclude,
  });
  return {
    server: toMcServer(updated),
    transfer: job ?? getTransferJob(input.serverId),
  };
}

export async function getServerTransferView(serverId: string) {
  const job = getTransferJob(serverId);
  const updated = await findServerOrThrow({
    where: { id: serverId },
    include: serverListInclude,
  });
  return {
    transfer: job,
    server: toMcServer(updated),
  };
}
