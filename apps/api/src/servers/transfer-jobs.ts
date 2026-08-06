import fs from "node:fs/promises";
import path from "node:path";
import type { TransferJobStatus } from "@msm/shared";
import { config } from "../config.js";

export const TRANSFER_STEPS = [
  "Validate",
  "Export from source node",
  "Rebind network",
  "Deploy to destination",
  "Update DNS & clean up",
  "Finish",
] as const;

export type TransferJob = TransferJobStatus & {
  fromNodeId: string;
  toNodeId: string;
  startAfter: boolean;
  actor: { id: string; username: string } | null;
};

const jobs = new Map<string, TransferJob>();

function transferJobDir(): string {
  return path.join(config.dataDir, "transfers");
}

function transferJobPath(serverId: string): string {
  return path.join(transferJobDir(), `${serverId}.json`);
}

export async function persistTransferJob(job: TransferJob): Promise<void> {
  try {
    await fs.mkdir(transferJobDir(), { recursive: true });
    const tmp = `${transferJobPath(job.serverId)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(job), "utf8");
    await fs.rename(tmp, transferJobPath(job.serverId));
  } catch {
    // Persistence must never break a live transfer.
  }
  try {
    const { getRedis, transferRedisKey } = await import("../redis.js");
    const redis = await getRedis();
    if (redis) {
      await redis.set(transferRedisKey(job.serverId), JSON.stringify(job));
    }
  } catch {
    // ignore Redis blips
  }
}

export async function clearPersistedTransferJob(
  serverId: string,
): Promise<void> {
  await fs.unlink(transferJobPath(serverId)).catch(() => undefined);
  try {
    const { getRedis, transferRedisKey } = await import("../redis.js");
    const redis = await getRedis();
    if (redis) await redis.del(transferRedisKey(serverId));
  } catch {
    // ignore
  }
}

function jobFromDisk(raw: unknown): TransferJob | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Partial<TransferJob>;
  if (typeof j.serverId !== "string" || typeof j.step !== "string") return null;
  return {
    serverId: j.serverId,
    step: j.step,
    steps: Array.isArray(j.steps) ? (j.steps as string[]) : [...TRANSFER_STEPS],
    stepIndex: typeof j.stepIndex === "number" ? j.stepIndex : 0,
    error: typeof j.error === "string" ? j.error : null,
    done: Boolean(j.done),
    ok: Boolean(j.ok),
    percent: typeof j.percent === "number" ? j.percent : 0,
    detail: typeof j.detail === "string" ? j.detail : null,
    bytesTransferred:
      typeof j.bytesTransferred === "number" ? j.bytesTransferred : null,
    bytesTotal: typeof j.bytesTotal === "number" ? j.bytesTotal : null,
    fromNodeId: typeof j.fromNodeId === "string" ? j.fromNodeId : "",
    toNodeId: typeof j.toNodeId === "string" ? j.toNodeId : "",
    startAfter: Boolean(j.startAfter),
    actor: j.actor ?? null,
  };
}

/** Restore incomplete transfer UI state after an API restart (no auto-resume). */
export async function hydrateTransferJobsFromDisk(): Promise<void> {
  const ingest = (raw: unknown) => {
    const job = jobFromDisk(raw);
    if (!job || jobs.has(job.serverId)) return;
    if (!job.done) {
      job.error =
        job.error ??
        "API restarted during transfer — progress restored; re-run move if needed.";
      job.done = true;
      job.ok = false;
    }
    jobs.set(job.serverId, job);
  };

  try {
    const { getRedis, scanRedisKeys, TRANSFER_KEY_PREFIX } = await import(
      "../redis.js"
    );
    const redis = await getRedis();
    if (redis) {
      const keys = await scanRedisKeys(`${TRANSFER_KEY_PREFIX}*`);
      for (const key of keys) {
        try {
          const raw = await redis.get(key);
          if (!raw) continue;
          ingest(JSON.parse(raw) as unknown);
        } catch {
          // ignore corrupt keys
        }
      }
    }
  } catch {
    // Redis optional
  }

  let names: string[] = [];
  try {
    names = await fs.readdir(transferJobDir());
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(
        await fs.readFile(path.join(transferJobDir(), name), "utf8"),
      ) as unknown;
      ingest(raw);
    } catch {
      // ignore corrupt files
    }
  }
}

/** In-memory transfer job count (for Prometheus). */
export function countTransferJobsInMemory(): number {
  return jobs.size;
}

export function getTransferJob(serverId: string): TransferJobStatus | null {
  const job = jobs.get(serverId);
  if (!job) return null;
  const {
    serverId: id,
    step,
    steps,
    stepIndex,
    error,
    done,
    ok,
    percent,
    detail,
    bytesTransferred,
    bytesTotal,
  } = job;
  return {
    serverId: id,
    step,
    steps,
    stepIndex,
    error,
    done,
    ok,
    percent,
    detail,
    bytesTransferred: bytesTransferred ?? null,
    bytesTotal: bytesTotal ?? null,
  };
}

export function getTransferJobInMemory(
  serverId: string,
): TransferJob | undefined {
  return jobs.get(serverId);
}

export function setTransferJobInMemory(job: TransferJob): void {
  jobs.set(job.serverId, job);
}

/** Base % at the start of each step index (last = done). */
const STEP_PERCENT = [0, 8, 42, 52, 88, 96, 100] as const;

export function setTransferStep(
  job: TransferJob,
  stepIndex: number,
  detail: string | null = null,
): void {
  job.stepIndex = stepIndex;
  job.step = TRANSFER_STEPS[stepIndex] ?? "Working";
  job.detail = detail;
  job.percent =
    STEP_PERCENT[Math.min(stepIndex, STEP_PERCENT.length - 1)] ?? 0;
  void persistTransferJob(job);
}

export function setTransferChunkProgress(
  job: TransferJob,
  stepIndex: number,
  fraction: number,
  detail: string | null,
  bytesTransferred?: number,
  bytesTotal?: number,
): void {
  const start = STEP_PERCENT[stepIndex] ?? 0;
  const end = STEP_PERCENT[stepIndex + 1] ?? 100;
  const f = Math.min(1, Math.max(0, fraction));
  job.stepIndex = stepIndex;
  job.step = TRANSFER_STEPS[stepIndex] ?? "Working";
  job.detail = detail;
  job.percent = Math.round(start + (end - start) * f);
  if (bytesTransferred !== undefined) job.bytesTransferred = bytesTransferred;
  if (bytesTotal !== undefined) job.bytesTotal = bytesTotal;
  void persistTransferJob(job);
}

export function scheduleTransferJobCleanup(
  serverId: string,
  delayMs = 30 * 60_000,
): void {
  setTimeout(() => {
    const current = jobs.get(serverId);
    if (current?.done) {
      jobs.delete(serverId);
      void clearPersistedTransferJob(serverId);
    }
  }, delayMs);
}
