import type { AthkarItem, AthkarPeriod } from '@/shared/contracts/athkar';

/**
 * The reader's daily count, kept on the device.
 *
 * There is no account behind this and nothing is synced: the count is a
 * checklist for today's sitting, so it lives in `localStorage` next to the
 * services-menu order and dies with the site's storage. The one thing it must
 * get right is the day boundary — a count is only ever *today's* — so the stored
 * record carries the local calendar day it belongs to and every read compares it
 * with the reader's current one. A stale record reads as zero and is overwritten
 * on the first tap; there is no timer to miss and nothing to migrate.
 *
 * The day key is built from local date parts, never from `toISOString()`: the
 * latter is UTC, which would roll the count over at 15:00 in Damascus and 21:00
 * in Tokyo.
 *
 * **This module must stay free of React.** The hook that renders from it is
 * `use-athkar-counts.ts`, and the tests drive these functions directly.
 */
export const ATHKAR_COUNTS_KEY = 'rr:athkar-counts:v1';

/** Counts for one period, keyed by the item's `id`. */
export type AthkarPeriodCounts = Readonly<Record<string, number>>;

export interface AthkarCounts {
  /** Local calendar day, `YYYY-MM-DD`. A record for any other day reads as zero. */
  day: string;
  morning: AthkarPeriodCounts;
  evening: AthkarPeriodCounts;
}

/** `YYYY-MM-DD` in the device's own timezone. */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function emptyCounts(day: string): AthkarCounts {
  return { day, morning: {}, evening: {} };
}

function storage(store?: Storage | null): Storage | null {
  if (store !== undefined) return store;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Private mode or a blocked store must fall back to a fresh day.
    return null;
  }
}

/** The stored counts for `day`, or a fresh record when the device has none. */
export function readCounts(day: string, store?: Storage | null): AthkarCounts {
  const target = storage(store);
  if (!target) return emptyCounts(day);

  try {
    const raw = target.getItem(ATHKAR_COUNTS_KEY);
    if (!raw) return emptyCounts(day);

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyCounts(day);
    // Yesterday's checklist is not today's: the record is only meaningful for
    // the day it was written, so any other day reads as zero.
    if (parsed.day !== day) return emptyCounts(day);

    return {
      day,
      morning: readPeriodCounts(parsed.morning),
      evening: readPeriodCounts(parsed.evening),
    };
  } catch {
    // A half-written or hand-edited value is the same as no count.
    return emptyCounts(day);
  }
}

export function writeCounts(state: AthkarCounts, store?: Storage | null): void {
  const target = storage(store);
  if (!target) return;

  try {
    target.setItem(ATHKAR_COUNTS_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store only costs the visitor today's checkmarks.
  }
}

/** One more tap on `id`, never past the count the narration states. */
export function increment(
  state: AthkarCounts,
  period: AthkarPeriod,
  id: string,
  target: number
): AthkarCounts {
  const current = countFor(state, period, id);
  const next = Math.min(current + 1, Math.max(target, 1));
  if (next === current) return state;

  return { ...state, [period]: { ...state[period], [id]: next } };
}

/** Forget one dhikr's count, so a mistap can be corrected. */
export function clearOne(state: AthkarCounts, period: AthkarPeriod, id: string): AthkarCounts {
  if (state[period][id] === undefined) return state;

  const next = { ...state[period] };
  delete next[id];
  return { ...state, [period]: next };
}

/** The count to render: a stored value can be old, hand-edited or over target. */
export function countFor(state: AthkarCounts, period: AthkarPeriod, id: string, limit = Infinity) {
  const stored = state[period][id] ?? 0;
  if (!Number.isFinite(stored) || stored <= 0) return 0;
  return Math.min(Math.floor(stored), Math.max(limit, 0));
}

/** How many dhikr of `items` are complete — the progress line's numerator. */
export function completedCount(
  state: AthkarCounts,
  period: AthkarPeriod,
  items: readonly AthkarItem[]
): number {
  return items.filter((item) => countFor(state, period, item.id, item.repeat) >= item.repeat)
    .length;
}

/**
 * Milliseconds until the next local midnight, plus a second of slack: a timer
 * that fires a hair early must still land on the new day rather than reschedule
 * for the one it just left.
 */
export function nextMidnightDelay(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime() + 1_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPeriodCounts(value: unknown): AthkarPeriodCounts {
  if (!isRecord(value)) return {};

  const counts: Record<string, number> = {};
  for (const [id, count] of Object.entries(value)) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
    counts[id] = Math.floor(count);
  }
  return counts;
}
