import type {
  LocalUsageActionKey,
  OwnedItemKey,
  PlanCaps,
  UsageState,
} from '@/shared/contracts/plans';
import { identityUserId, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import { getMyCaps, getMyUsage, reportLocalUsage } from '@/frontend/api/plans';
import { ApiError } from '@/frontend/transport/http';

/**
 * The client's half of the plan rules (ADR-0075).
 *
 * Two things live here, and they are both about working offline:
 *
 *   * the caps the account's plan allows, cached per identity, so a create can
 *     be refused on the device instead of queueing an intent the server is
 *     certain to reject;
 *   * the counters for actions that never talk to the server (a scan, a surah
 *     read today), and the small queue that reports them for reconciliation.
 *
 * A missing cache means "not known yet", never "no allowance": a first visit on
 * a cold device must not block a create. The server is always the authority.
 */

const CAPS_PREFIX = 'royaraqamia:plan-caps:';
const USAGE_PREFIX = 'royaraqamia:usage:';
const LOCAL_USAGE_QUEUE = 'royaraqamia:local-usage-queue';
const LOCAL_USAGE_COUNTERS = 'royaraqamia:local-usage-counters';
const LOCAL_USAGE_MARKS = 'royaraqamia:local-usage-marks';

/** The visitor allowance, mirrored from the seeded `plan_settings` row. */
export const ANONYMOUS_DAILY_CREDITS_FALLBACK = 10;

interface CachedCaps extends PlanCaps {
  fetchedAt: number;
}

interface QueuedLocalUsage {
  clientEventId: string;
  actionKey: LocalUsageActionKey;
  createdAt: number;
}

interface LocalUsageCounters {
  [actionKey: string]: { date: string; count: number };
}

/** A create the cached caps refuse, before anything is written or queued. */
export class PlanCapReachedError extends Error {
  constructor(
    readonly item: OwnedItemKey,
    readonly cap: number
  ) {
    super(`بلغتَ الحدّ الأعلى للخطة الحالية (${cap}) لهذا العنصر.`);
    this.name = 'PlanCapReachedError';
  }
}

/** A refusal the server answered with, whichever plan rule it enforced. */
export function isPlanRefusal(error: unknown): boolean {
  return (
    error instanceof PlanCapReachedError || (error instanceof ApiError && error.status === 402)
  );
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // A browser with storage disabled still has to work; it just cannot cache.
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const raw = storage()?.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: the next online check will refresh the cache.
  }
}

function userKey(prefix: string, userId: string): string {
  return `${prefix}${userId}`;
}

export function cachePlanLimits(userId: string, caps: PlanCaps, state: UsageState): void {
  const cached: CachedCaps = { ...caps, fetchedAt: Date.now() };
  writeJson(userKey(CAPS_PREFIX, userId), cached);
  writeJson(userKey(USAGE_PREFIX, userId), state);
}

export function clearPlanLimits(userId: string): void {
  storage()?.removeItem(userKey(CAPS_PREFIX, userId));
  storage()?.removeItem(userKey(USAGE_PREFIX, userId));
}

export function readCachedCaps(identity: LocalIdentity): PlanCaps | null {
  const userId = identityUserId(identity);
  if (!userId) return null;
  return readJson<CachedCaps>(userKey(CAPS_PREFIX, userId));
}

export function readCachedUsage(identity: LocalIdentity): UsageState | null {
  const userId = identityUserId(identity);
  if (!userId) return null;
  return readJson<UsageState>(userKey(USAGE_PREFIX, userId));
}

/**
 * Refuse a create that would pass a cap the account has already reached. A
 * guest, or a device that has not fetched the caps yet, is allowed through and
 * the server answers the truth when the intent replays.
 */
export function assertOwnedItemSlot(
  identity: LocalIdentity,
  item: OwnedItemKey,
  currentCount: number
): void {
  const caps = readCachedCaps(identity);
  if (!caps || caps.unlimited) return;

  const cap = caps.caps[item];
  if (typeof cap === 'number' && currentCount >= cap) throw new PlanCapReachedError(item, cap);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Count one locally metered action and queue it for the ledger.
 *
 * `dedupeKey` makes the action once-per-day (`quran:2:2026-10-22`): a re-read
 * the same day is not another credit, and the mark survives a flush so it stays
 * true until the date changes. Returns false when the action was already
 * counted, so the caller can skip its own bookkeeping too.
 */
export function recordLocalUsage(actionKey: LocalUsageActionKey, dedupeKey?: string): boolean {
  const date = today();

  if (dedupeKey) {
    const marks = readJson<Record<string, string>>(LOCAL_USAGE_MARKS) ?? {};
    if (marks[dedupeKey] === date) return false;
    marks[dedupeKey] = date;
    writeJson(LOCAL_USAGE_MARKS, marks);
  }

  const counters = readJson<LocalUsageCounters>(LOCAL_USAGE_COUNTERS) ?? {};
  const current = counters[actionKey];
  counters[actionKey] =
    current && current.date === date ? { date, count: current.count + 1 } : { date, count: 1 };
  writeJson(LOCAL_USAGE_COUNTERS, counters);

  const queue = readLocalUsageQueue();
  queue.push({ clientEventId: uuidv7(), actionKey, createdAt: Date.now() });
  writeJson(LOCAL_USAGE_QUEUE, queue.slice(-200));
  return true;
}

/** How many of an action this device counted today (0 when the date rolled). */
export function localUsageToday(actionKey: LocalUsageActionKey): number {
  const counters = readJson<LocalUsageCounters>(LOCAL_USAGE_COUNTERS) ?? {};
  return counters[actionKey]?.date === today() ? counters[actionKey].count : 0;
}

export function readLocalUsageQueue(): QueuedLocalUsage[] {
  return readJson<QueuedLocalUsage[]>(LOCAL_USAGE_QUEUE) ?? [];
}

/**
 * Report the queued counters. Runs on boot and whenever the session refreshes,
 * never from the scanner itself: the only thing that leaves the device is a
 * count, and only for a signed-in account (ADR-0034's promise is about the
 * content, which never leaves at all).
 */
export async function flushLocalUsage(): Promise<void> {
  const queue = readLocalUsageQueue();
  if (queue.length === 0) return;

  const batch = queue.slice(0, 50);
  try {
    await reportLocalUsage(
      batch.map(({ clientEventId, actionKey }) => ({ clientEventId, actionKey }))
    );
    const reported = new Set(batch.map((entry) => entry.clientEventId));
    writeJson(
      LOCAL_USAGE_QUEUE,
      queue.filter((entry) => !reported.has(entry.clientEventId))
    );
  } catch {
    // Offline, signed out, or a refusal: keep the queue for the next attempt,
    // which reads the whole queue again and reports whatever is still there.
  }
}

/**
 * Refresh the cached caps and allowance for a signed-in account, then report
 * whatever the device counted. Called when a session appears and on `online`.
 */
export async function refreshPlanLimits(userId: string): Promise<void> {
  await flushLocalUsage();

  try {
    const [caps, usage] = await Promise.all([getMyCaps(), getMyUsage()]);
    cachePlanLimits(userId, caps, usage);
  } catch {
    // Keep the last known cache; a create then behaves as it did offline.
  }
}
