import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANONYMOUS_DAILY_CREDITS_FALLBACK,
  PlanCapReachedError,
  assertOwnedItemSlot,
  cachePlanLimits,
  clearPlanLimits,
  localUsageToday,
  readCachedCaps,
  recordLocalUsage,
} from '@/frontend/shared/plans/plan-limits';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import type { PlanCaps, UsageState } from '@/shared/contracts/plans';

vi.mock('@/frontend/api/plans', () => ({
  getMyCaps: vi.fn(),
  getMyUsage: vi.fn(),
  reportLocalUsage: vi.fn(async () => ({
    recorded: 1,
    alreadyRecorded: 0,
    refused: 0,
    state: { remaining: 99 },
  })),
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
    expect(localUsageToday('quran.surah.read')).toBe(0);

    expect(recordLocalUsage('quran.surah.read', 'quran:2:2026-10-22')).toBe(true);
    expect(recordLocalUsage('quran.surah.read', 'quran:2:2026-10-22')).toBe(false);
    expect(localUsageToday('quran.surah.read')).toBe(1);

    expect(recordLocalUsage('quran.surah.read', 'quran:3:2026-10-22')).toBe(true);
    expect(localUsageToday('quran.surah.read')).toBe(2);
  });

  it('counts every scan, since a scan has no dedupe key', () => {
    recordLocalUsage('scanner.scan');
    recordLocalUsage('scanner.scan');

    expect(localUsageToday('scanner.scan')).toBe(2);
  });

  it('mirrors the seeded visitor allowance', () => {
    expect(ANONYMOUS_DAILY_CREDITS_FALLBACK).toBe(10);
  });
});
