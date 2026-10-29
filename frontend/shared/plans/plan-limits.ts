import {
  VISITOR_COUNTER_CAPS,
  VISITOR_ITEM_CAPS,
  type LocalUsageActionKey,
  type OwnedItemKey,
  type PlanCaps,
  type UsageState,
} from '@/shared/contracts/plans';
import {
  identityUserId,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
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

const CAPS_PREFIX = 'royaraqamia:plan-caps:v2:';
const USAGE_PREFIX = 'royaraqamia:usage:v2:';
const LOCAL_USAGE_QUEUE_PREFIX = 'royaraqamia:local-usage-queue:';
const LOCAL_USAGE_COUNTERS_PREFIX = 'royaraqamia:local-usage-counters:';
const LOCAL_USAGE_MARKS_PREFIX = 'royaraqamia:local-usage-marks:';

/**
 * A day is a Damascus day, the same one the server counts against: a daily
 * allowance that flipped at UTC midnight would hand a reader in Damascus a new
 * allowance two hours early (ADR-0093).
 */
const DAMASCUS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus' });

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
    readonly cap: number,
    readonly visitor = false
  ) {
    super(
      visitor
        ? `الزُّوّار يحفظون ${cap} فقط من هذا العنصر. سجِّل الدُّخول لمتابعة الاستخدام.`
        : `بلغتَ الحدّ الأعلى للخطة الحالية (${cap}) لهذا العنصر.`
    );
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

function scopedKey(prefix: string, scope: string): string {
  return `${prefix}${scope}`;
}

export function cachePlanLimits(userId: string, caps: PlanCaps, state: UsageState): void {
  const cached: CachedCaps = { ...caps, fetchedAt: Date.now() };
  writeJson(scopedKey(CAPS_PREFIX, userId), cached);
  writeJson(scopedKey(USAGE_PREFIX, userId), state);
}

export function clearPlanLimits(userId: string): void {
  storage()?.removeItem(scopedKey(CAPS_PREFIX, userId));
  storage()?.removeItem(scopedKey(USAGE_PREFIX, userId));
}

export function readCachedCaps(identity: LocalIdentity): PlanCaps | null {
  const userId = identityUserId(identity);
  if (!userId) return null;
  return readJson<CachedCaps>(scopedKey(CAPS_PREFIX, userId));
}

export function readCachedUsage(identity: LocalIdentity): UsageState | null {
  const userId = identityUserId(identity);
  if (!userId) return null;
  return readJson<UsageState>(scopedKey(USAGE_PREFIX, userId));
}

/**
 * Refuse a create that would pass a cap the account has already reached.
 *
 * A signed-in account with no cached caps yet is let through and the server
 * answers the truth when the intent replays. A guest has no account to read a
 * cap for, so the visitor number applies (one item, mirrored from
 * `plan_limits.visitor_cap`) — that check is the only place a visitor limit can
 * live, because their items never reach the server.
 */
export function assertOwnedItemSlot(
  identity: LocalIdentity,
  item: OwnedItemKey,
  currentCount: number
): void {
  const caps = readCachedCaps(identity);
  if (caps?.unlimited) return;

  const visitor = caps === null && !identityUserId(identity);
  const cap = caps ? caps.caps[item] : visitor ? VISITOR_ITEM_CAPS[item] : undefined;

  if (typeof cap === 'number' && currentCount >= cap) {
    throw new PlanCapReachedError(item, cap, visitor);
  }
}

function today(): string {
  return DAMASCUS_DAY.format(new Date());
}

/** The Damascus day a local count belongs to, as `YYYY-MM-DD`. */
export function localDay(): string {
  return today();
}

/**
 * The daily cap a device can enforce for itself, or null when it does not know
 * one. A signed-in account with no cached caps is "not known yet" and is let
 * through — the server answers the truth when the intent replays. A guest has no
 * account to fetch a cap for, so the mirrored visitor number applies.
 */
export function localUsageCap(
  identity: LocalIdentity,
  actionKey: LocalUsageActionKey
): number | null {
  const caps = readCachedCaps(identity);
  if (caps) {
    if (caps.unlimited) return null;
    return caps.counters[actionKey]?.cap ?? null;
  }

  return identityUserId(identity) ? null : VISITOR_COUNTER_CAPS[actionKey];
}

/** Whether this identity may still count one more of the action today. */
export function canRecordLocalUsage(
  identity: LocalIdentity,
  actionKey: LocalUsageActionKey
): boolean {
  const cap = localUsageCap(identity, actionKey);
  if (cap === null) return true;
  return localUsageToday(identity, actionKey) < cap;
}

/**
 * Count one locally metered action and queue it for the ledger.
 *
 * The counters, dedupe marks and queue are partitioned by identity, the same way
 * the Local Store is: a guest's scans stay in the guest bucket and never reach
 * an account they later sign into, and two accounts sharing a browser never see
 * each other's counts.
 *
 * `dedupeKey` makes the action once-per-day (`quran:2:2026-10-22`): a re-read
 * the same day is not another count, and the mark survives a flush so it stays
 * true until the date changes. Returns false when the action was already counted
 * or the device already knows the day's cap is reached, so the caller can skip
 * its own bookkeeping too — and so the queue never carries an intent the server
 * is certain to refuse.
 */
export function recordLocalUsage(
  identity: LocalIdentity,
  actionKey: LocalUsageActionKey,
  dedupeKey?: string
): boolean {
  const date = today();

  if (dedupeKey) {
    const marksKey = scopedKey(LOCAL_USAGE_MARKS_PREFIX, identity);
    const marks = readJson<Record<string, string>>(marksKey) ?? {};
    if (marks[dedupeKey] === date) return false;
    if (!canRecordLocalUsage(identity, actionKey)) return false;
    marks[dedupeKey] = date;
    writeJson(marksKey, marks);
  } else if (!canRecordLocalUsage(identity, actionKey)) {
    return false;
  }

  const countersKey = scopedKey(LOCAL_USAGE_COUNTERS_PREFIX, identity);
  const counters = readJson<LocalUsageCounters>(countersKey) ?? {};
  const current = counters[actionKey];
  counters[actionKey] =
    current && current.date === date ? { date, count: current.count + 1 } : { date, count: 1 };
  writeJson(countersKey, counters);

  const queue = readLocalUsageQueue(identity);
  queue.push({ clientEventId: uuidv7(), actionKey, createdAt: Date.now() });
  writeJson(scopedKey(LOCAL_USAGE_QUEUE_PREFIX, identity), queue.slice(-200));
  return true;
}

/** How many of an action this identity counted today (0 when the date rolled). */
export function localUsageToday(identity: LocalIdentity, actionKey: LocalUsageActionKey): number {
  const counters =
    readJson<LocalUsageCounters>(scopedKey(LOCAL_USAGE_COUNTERS_PREFIX, identity)) ?? {};
  return counters[actionKey]?.date === today() ? counters[actionKey].count : 0;
}

export function readLocalUsageQueue(identity: LocalIdentity): QueuedLocalUsage[] {
  return readJson<QueuedLocalUsage[]>(scopedKey(LOCAL_USAGE_QUEUE_PREFIX, identity)) ?? [];
}

/**
 * Report the queue that belongs to one signed-in account. Runs on boot and
 * whenever the session refreshes, never from the scanner itself: the only thing
 * that leaves the device is a count, and only for the account that recorded it
 * (ADR-0034's promise is about the content, which never leaves at all).
 *
 * A guest's queue is never reported — there is no account to charge it to, and
 * its cap is enforced locally by {@link localUsageToday}.
 */
export async function flushLocalUsage(userId: string): Promise<void> {
  if (!userId) return;

  const identity = userIdentity(userId);
  const queue = readLocalUsageQueue(identity);
  if (queue.length === 0) return;

  const batch = queue.slice(0, 50);
  try {
    await reportLocalUsage(
      batch.map(({ clientEventId, actionKey }) => ({ clientEventId, actionKey }))
    );
    const reported = new Set(batch.map((entry) => entry.clientEventId));
    writeJson(
      scopedKey(LOCAL_USAGE_QUEUE_PREFIX, identity),
      queue.filter((entry) => !reported.has(entry.clientEventId))
    );
  } catch {
    // Offline, signed out, or a refusal: keep the queue for the next attempt,
    // which reads the whole queue again and reports whatever is still there.
  }
}

/**
 * Refresh the cached caps and allowance for a signed-in account, then report
 * whatever that account counted. Called when a session appears and on `online`.
 */
export async function refreshPlanLimits(userId: string): Promise<void> {
  await flushLocalUsage(userId);

  try {
    const [caps, usage] = await Promise.all([getMyCaps(), getMyUsage()]);
    cachePlanLimits(userId, caps, usage);
  } catch {
    // Keep the last known cache; a create then behaves as it did offline.
  }
}
