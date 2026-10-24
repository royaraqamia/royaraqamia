import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANONYMOUS_DAILY_CREDITS_FALLBACK,
  PlanCapReachedError,
  assertOwnedItemSlot,
  cachePlanLimits,
  clearPlanLimits,
  flushLocalUsage,
  localUsageToday,
  readCachedCaps,
  readLocalUsageQueue,
  recordLocalUsage,
} from '@/frontend/shared/plans/plan-limits';
import { GUEST_IDENTITY, userIdentity } from '@/frontend/shared/local-store/identity';
import type { PlanCaps, UsageState } from '@/shared/contracts/plans';

const mocks = vi.hoisted(() => ({
  reportLocalUsage: vi.fn(async (_events: Array<{ clientEventId: string; actionKey: string }>) => ({
    recorded: 1,
    alreadyRecorded: 0,
    refused: 0,
    state: { remaining: 99 },
  })),
}));

vi.mock('@/frontend/api/plans', () => ({
  getMyCaps: vi.fn(),
  getMyUsage: vi.fn(),
  reportLocalUsage: mocks.reportLocalUsage,
}));

const identity = userIdentity('user-1');

const freeCaps: PlanCaps = {
  plan: 'free',
  unlimited: false,
  caps: { habits: 5 } as PlanCaps['caps'],
};

const state: UsageState = {
  plan: 'free',
  unlimited: false,
  cap: 100,
  spent: 1,
  remaining: 99,
  windowDays: 30,
  expiresAt: null,
};

describe('local plan limits', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.reportLocalUsage.mockClear();
  });

  it('never refuses a create before the caps are known', () => {
    expect(() => assertOwnedItemSlot(identity, 'habits', 50)).not.toThrow();
    expect(readCachedCaps(identity)).toBeNull();
  });

  it('refuses a create at the cached cap, and allows one slot below it', () => {
    cachePlanLimits('user-1', freeCaps, state);

    expect(() => assertOwnedItemSlot(identity, 'habits', 4)).not.toThrow();
    let thrown: unknown;
    try {
      assertOwnedItemSlot(identity, 'habits', 5);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PlanCapReachedError);
    expect(thrown).toMatchObject({ item: 'habits', cap: 5 });
  });

  it('does not refuse anything for an unlimited account', () => {
    cachePlanLimits('user-1', { ...freeCaps, unlimited: true }, state);

    expect(() => assertOwnedItemSlot(identity, 'habits', 10_000)).not.toThrow();
  });

  it('forgets the caps of a signed-out account', () => {
    cachePlanLimits('user-1', freeCaps, state);
    clearPlanLimits('user-1');

    expect(readCachedCaps(identity)).toBeNull();
  });

  it('counts a locally metered action once per dedupe key per day', () => {
    expect(localUsageToday(identity, 'quran.surah.read')).toBe(0);

    expect(recordLocalUsage(identity, 'quran.surah.read', 'quran:2:2026-10-22')).toBe(true);
    expect(recordLocalUsage(identity, 'quran.surah.read', 'quran:2:2026-10-22')).toBe(false);
    expect(localUsageToday(identity, 'quran.surah.read')).toBe(1);

    expect(recordLocalUsage(identity, 'quran.surah.read', 'quran:3:2026-10-22')).toBe(true);
    expect(localUsageToday(identity, 'quran.surah.read')).toBe(2);
  });

  it('counts every scan, since a scan has no dedupe key', () => {
    recordLocalUsage(identity, 'scanner.scan');
    recordLocalUsage(identity, 'scanner.scan');

    expect(localUsageToday(identity, 'scanner.scan')).toBe(2);
  });

  it('mirrors the seeded visitor allowance', () => {
    expect(ANONYMOUS_DAILY_CREDITS_FALLBACK).toBe(10);
  });

  it('stops the guest at the visitor allowance without touching an account', () => {
    for (let scan = 0; scan < ANONYMOUS_DAILY_CREDITS_FALLBACK; scan += 1) {
      recordLocalUsage(GUEST_IDENTITY, 'scanner.scan');
    }

    expect(localUsageToday(GUEST_IDENTITY, 'scanner.scan')).toBe(ANONYMOUS_DAILY_CREDITS_FALLBACK);
    expect(localUsageToday(identity, 'scanner.scan')).toBe(0);
    expect(readLocalUsageQueue(identity)).toHaveLength(0);
  });

  it('does not report a guest queue to the account the guest signs into', async () => {
    recordLocalUsage(GUEST_IDENTITY, 'scanner.scan');
    recordLocalUsage(GUEST_IDENTITY, 'scanner.scan');

    await flushLocalUsage('user-1');

    expect(mocks.reportLocalUsage).not.toHaveBeenCalled();
    expect(readLocalUsageQueue(GUEST_IDENTITY)).toHaveLength(2);
    expect(readLocalUsageQueue(identity)).toHaveLength(0);
    expect(localUsageToday(identity, 'scanner.scan')).toBe(0);
  });

  it('reports only the events queued by the account being flushed', async () => {
    const otherIdentity = userIdentity('user-2');
    recordLocalUsage(identity, 'scanner.scan');
    recordLocalUsage(identity, 'scanner.scan');
    recordLocalUsage(otherIdentity, 'scanner.scan');

    await flushLocalUsage('user-2');

    expect(mocks.reportLocalUsage).toHaveBeenCalledTimes(1);
    expect(mocks.reportLocalUsage.mock.calls[0]?.[0]).toHaveLength(1);
    expect(readLocalUsageQueue(otherIdentity)).toHaveLength(0);
    expect(readLocalUsageQueue(identity)).toHaveLength(2);

    await flushLocalUsage('user-1');

    expect(mocks.reportLocalUsage).toHaveBeenCalledTimes(2);
    expect(mocks.reportLocalUsage.mock.calls[1]?.[0]).toHaveLength(2);
    expect(readLocalUsageQueue(identity)).toHaveLength(0);
  });

  it("keeps a guest's read from suppressing the signed-in reader's credit", () => {
    const dedupeKey = 'quran:2:2026-10-22';

    expect(recordLocalUsage(GUEST_IDENTITY, 'quran.surah.read', dedupeKey)).toBe(true);
    expect(recordLocalUsage(identity, 'quran.surah.read', dedupeKey)).toBe(true);
    expect(recordLocalUsage(identity, 'quran.surah.read', dedupeKey)).toBe(false);

    expect(localUsageToday(GUEST_IDENTITY, 'quran.surah.read')).toBe(1);
    expect(localUsageToday(identity, 'quran.surah.read')).toBe(1);
  });

  it('partitions counters, marks and the queue by identity in storage', () => {
    recordLocalUsage(GUEST_IDENTITY, 'scanner.scan');
    recordLocalUsage(identity, 'scanner.scan');

    const keys = Object.keys(window.localStorage);
    expect(keys).toContain(`royaraqamia:local-usage-counters:${GUEST_IDENTITY}`);
    expect(keys).toContain(`royaraqamia:local-usage-counters:${identity}`);
    expect(keys).toContain(`royaraqamia:local-usage-queue:${GUEST_IDENTITY}`);
    expect(keys).toContain(`royaraqamia:local-usage-queue:${identity}`);
  });
});
