import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db.js";

export function hashDaemonToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateDaemonToken(): string {
  return randomBytes(32).toString("hex");
}

export async function findNodeByDaemonToken(token: string) {
  const tokenHash = hashDaemonToken(token);
  return prisma.node.findFirst({ where: { tokenHash } });
}
