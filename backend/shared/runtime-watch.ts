import { getHeapStatistics } from 'node:v8';
import { Redis } from '@upstash/redis';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';

/**
 * The two facts a 512 MB instance cannot answer from its own logs (ADR-0199).
 *
 * An OOM restart arrived as an email, and the only way to date it was to diff
 * deploy times against instance IDs in the log stream: the process wrote
 * nothing when it started and nothing while it ran. So this module writes one
 * `[boot]` line at every start — with the previous start and whether this one
 * came off a new build, which is what separates "a deploy landed" from "the
 * same build came back" — and one `[memory]` line every five minutes, which is
 * the ramp-or-flat evidence the Render dashboard's graph would have given.
 *
 * Both are observations, not decisions: nothing here restarts, refuses or
 * trims anything, and a missing Redis leaves the previous-boot fields null
 * rather than failing the boot.
 */

/** Where a boot records itself, so the next one on this service can date the gap. */
const BOOT_KEY = 'runtime:boot';
/** A cold start must never wait on Redis; past this the previous-boot fields stay null. */
const STORE_BUDGET_MS = 800;
/**
 * Five minutes is the smallest cadence that still shows a ramp on a process
 * that lives a working day — ~30 samples — without the watcher becoming the
 * busiest writer in the log stream.
 */
export const MEMORY_TRACE_INTERVAL_MS = 5 * 60 * 1000;

export interface BootRecord {
  commit: string;
  /** ISO timestamp of the start this record describes. */
  startedAt: string;
}

export interface BootStore {
  read(): Promise<BootRecord | null>;
  write(record: BootRecord): Promise<void>;
}

export interface BootFacts {
  release: string;
  commit: string;
  instance: string | null;
  pid: number;
  node: string;
  rssBytes: number;
  heapLimitBytes: number;
}

export type BootReport = {
  release: string;
  commit: string;
  instance: string | null;
  pid: number;
  node: string;
  rssMb: number;
  /** What V8 reports — old generation plus young — and therefore what it collects against. */
  heapLimitMb: number;
  /** When the previous start on this service happened, if the store could be read. */
  previousBootAt: string | null;
  /** How long the previous process had been running when this one started. */
  sincePreviousBootMs: number | null;
  /**
   * False when this start followed a new deploy; true when the same build came
   * back — a restart or a wake, which the deploy list and Render's events then
   * tell apart. `null` when the store had nothing to compare.
   */
  sameCommitAsPreviousBoot: boolean | null;
};

export type MemorySample = {
  rssMb: number;
  heapUsedMb: number;
  heapLimitMb: number;
  externalMb: number;
  uptimeMin: number;
};

function megabytes(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

/**
 * The boot line's content, computed from its inputs so the shape can be tested
 * without a process to measure. A record that is unparseable, or dated in the
 * future (a clock that jumped), dates nothing: `null` is the honest answer, and
 * a wrong gap would be read as a restart that did not happen.
 */
export function buildBootReport(
  facts: BootFacts,
  previous: BootRecord | null,
  nowMs: number
): BootReport {
  const startedAt = previous ? Date.parse(previous.startedAt) : Number.NaN;
  const elapsed = nowMs - startedAt;
  const dated = previous !== null && Number.isFinite(startedAt) && elapsed >= 0;

  return {
    release: facts.release,
    commit: facts.commit,
    instance: facts.instance,
    pid: facts.pid,
    node: facts.node,
    rssMb: megabytes(facts.rssBytes),
    heapLimitMb: megabytes(facts.heapLimitBytes),
    previousBootAt: previous !== null && dated ? previous.startedAt : null,
    sincePreviousBootMs: dated ? elapsed : null,
    sameCommitAsPreviousBoot: previous !== null && dated ? previous.commit === facts.commit : null,
  };
}

export function buildMemorySample(
  usage: NodeJS.MemoryUsage,
  heapLimitBytes: number,
  uptimeSeconds: number
): MemorySample {
  return {
    rssMb: megabytes(usage.rss),
    heapUsedMb: megabytes(usage.heapUsed),
    heapLimitMb: megabytes(heapLimitBytes),
    externalMb: megabytes(usage.external),
    uptimeMin: Math.floor(uptimeSeconds / 60),
  };
}

/**
 * A store whose failures are absences rather than errors: the boot line is
 * worth more than the field it could not fill, and a Redis outage must not turn
 * into a boot that takes 30 seconds to fail.
 */
function withBudget<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), STORE_BUDGET_MS);
    timer.unref?.();
  });

  return Promise.race([work, budget])
    .catch(() => fallback)
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

export function createBootStore(config: { url?: string; token?: string }): BootStore | null {
  if (!config.url || !config.token) return null;
  const redis = new Redis({ url: config.url, token: config.token });

  return {
    read: () => withBudget<BootRecord | null>(redis.get<BootRecord>(BOOT_KEY), null),
    write: (record) => withBudget(redis.set(BOOT_KEY, record), undefined).then(() => undefined),
  };
}

export interface BootOptions {
  /** Injected by tests; production builds the store from the environment. */
  store?: BootStore | null;
  now?: () => number;
}

/**
 * The one line a restart is read from. It logs before it writes, so a store that
 * is down costs the gap and not the boot, and it never throws into `register()`.
 */
export async function noteBoot(options: BootOptions = {}): Promise<BootReport> {
  const store =
    options.store === undefined
      ? createBootStore({ url: env.upstashRedisUrl, token: env.upstashRedisToken })
      : options.store;
  const nowMs = options.now ? options.now() : Date.now();
  const previous = store ? await withBudget(store.read(), null) : null;

  const report = buildBootReport(
    {
      release: env.releaseVersion,
      commit: env.version,
      instance: process.env.RENDER_INSTANCE_ID ?? null,
      pid: process.pid,
      node: process.version,
      rssBytes: process.memoryUsage().rss,
      heapLimitBytes: getHeapStatistics().heap_size_limit,
    },
    previous,
    nowMs
  );

  logger.info('[boot]', report);

  if (store) {
    void store
      .write({ commit: report.commit, startedAt: new Date(nowMs).toISOString() })
      .catch(() => {
        // A boot that cannot be recorded is still a boot; the next gap is unknown.
      });
  }

  return report;
}

let tracing = false;

/**
 * `unref`'d on purpose: the trace must not be the reason the process cannot
 * exit, and a timer is the one thing here that could hold it open.
 */
export function startMemoryTrace(intervalMs: number = MEMORY_TRACE_INTERVAL_MS): void {
  if (tracing) return;
  tracing = true;

  const timer = setInterval(() => {
    logger.info(
      '[memory]',
      buildMemorySample(
        process.memoryUsage(),
        getHeapStatistics().heap_size_limit,
        process.uptime()
      )
    );
  }, intervalMs);
  timer.unref?.();
}
