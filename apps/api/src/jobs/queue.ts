/**
 * Durable job queues (BullMQ) when Redis is configured.
 * Falls back to in-process mode for single-API installs.
 */
import type { ReadinessReport } from "../admin-readiness.js";
import { isRedisConfigured, redisUrl } from "../redis.js";

export type JobsStatus = NonNullable<ReadinessReport["jobs"]>;

const QUEUE_NAMES = ["backups", "schedules", "transfers", "disk-watch", "maintenance"] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

type BullMqQueue = {
  add: (
    name: string,
    data: unknown,
    opts?: {
      jobId?: string;
      attempts?: number;
      backoff?: unknown;
      removeOnComplete?: number;
      removeOnFail?: number;
    },
  ) => Promise<{ id?: string }>;
  getJobCounts: (...types: string[]) => Promise<Record<string, number>>;
  close: () => Promise<void>;
};

type BullMqWorker = {
  close: () => Promise<void>;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
};

let mode: "bullmq" | "in_process" = "in_process";
const queues = new Map<QueueName, BullMqQueue>();
const workers: BullMqWorker[] = [];
let connection: { quit?: () => Promise<unknown>; disconnect?: () => void } | null = null;

function workersEnabled(): boolean {
  const v = (process.env.JOBS_BULLMQ ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return isRedisConfigured();
}

function embedWorkers(): boolean {
  const v = (process.env.JOBS_EMBEDDED ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

export function jobsMode(): "bullmq" | "in_process" {
  return mode;
}

export async function initJobQueues(handlers: {
  onBackupTick?: () => Promise<void>;
  onScheduleTick?: () => Promise<void>;
  onMaintenanceTick?: () => Promise<void>;
  onDiskWatchTick?: () => Promise<void>;
  onTransfer?: (data: {
    serverId: string;
    meta: {
      oldPort: number;
      newPort: number;
      subdomain: string | null;
      name: string;
    };
  }) => Promise<void>;
}): Promise<void> {
  if (!workersEnabled()) {
    mode = "in_process";
    return;
  }
  const url = redisUrl();
  if (!url) {
    mode = "in_process";
    return;
  }

  try {
    const bullmq = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    for (const name of QUEUE_NAMES) {
      const q = new bullmq.Queue(name, {
        connection: connection as never,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      }) as unknown as BullMqQueue;
      queues.set(name, q);
    }

    if (embedWorkers()) {
      const processor = async (queueName: QueueName, job: { data: unknown }) => {
        if (queueName === "backups") await handlers.onBackupTick?.();
        else if (queueName === "schedules") await handlers.onScheduleTick?.();
        else if (queueName === "maintenance") await handlers.onMaintenanceTick?.();
        else if (queueName === "disk-watch") await handlers.onDiskWatchTick?.();
        else if (queueName === "transfers") {
          const data = job.data as {
            serverId?: string;
            meta?: {
              oldPort: number;
              newPort: number;
              subdomain: string | null;
              name: string;
            };
          };
          if (data.serverId && data.meta) {
            await handlers.onTransfer?.({
              serverId: data.serverId,
              meta: data.meta,
            });
          }
        }
      };

      for (const name of QUEUE_NAMES) {
        const w = new bullmq.Worker(name, async (job) => processor(name, job), {
          connection: connection as never,
          concurrency: name === "transfers" ? 2 : 1,
        }) as unknown as BullMqWorker;
        w.on("failed", (...args: unknown[]) => {
          console.error(`[jobs] ${name} job failed`, args[0], args[1]);
        });
        workers.push(w);
      }
    }

    mode = "bullmq";
  } catch (err) {
    console.warn(
      "[jobs] BullMQ init failed — falling back to in-process:",
      err instanceof Error ? err.message : err,
    );
    mode = "in_process";
    await closeJobQueues().catch(() => undefined);
  }
}

export async function enqueueJob(
  queue: QueueName,
  name: string,
  data: unknown = {},
  opts?: { jobId?: string },
): Promise<boolean> {
  if (mode !== "bullmq") return false;
  const q = queues.get(queue);
  if (!q) return false;
  await q.add(name, data, {
    jobId: opts?.jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return true;
}

/** Enqueue a transfer; returns false if caller should run inline. */
export async function enqueueTransfer(
  serverId: string,
  meta: {
    oldPort: number;
    newPort: number;
    subdomain: string | null;
    name: string;
  },
): Promise<boolean> {
  return enqueueJob("transfers", "transfer", { serverId, meta }, { jobId: `transfer-${serverId}` });
}

export async function getJobsStatus(): Promise<JobsStatus> {
  if (mode !== "bullmq") {
    return {
      mode: "in_process",
      redisRequired: false,
    };
  }
  const out: JobsStatus = {
    mode: "bullmq",
    redisRequired: true,
    queues: [],
  };
  for (const name of QUEUE_NAMES) {
    const q = queues.get(name);
    if (!q) continue;
    try {
      const counts = await q.getJobCounts("waiting", "active", "failed", "delayed");
      out.queues!.push({
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    } catch {
      out.queues!.push({
        name,
        waiting: 0,
        active: 0,
        failed: 0,
        delayed: 0,
      });
    }
  }
  return out;
}

export async function closeJobQueues(): Promise<void> {
  for (const w of workers) {
    await w.close().catch(() => undefined);
  }
  workers.length = 0;
  for (const q of queues.values()) {
    await q.close().catch(() => undefined);
  }
  queues.clear();
  if (connection) {
    await connection.quit?.().catch(() => undefined);
    connection.disconnect?.();
    connection = null;
  }
  mode = "in_process";
}
