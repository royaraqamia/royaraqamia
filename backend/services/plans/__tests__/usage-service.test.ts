import { describe, expect, it, vi } from 'vitest';
import {
  OwnedItemCapReachedError,
  PlanTargetNotFoundError,
  UsageLimitReachedError,
  UsageService,
} from '@/backend/services/plans/usage-service';
import type { UsageRepository } from '@/backend/repositories/plans/usage-repository';
import type { UsageCounterState, UsageState } from '@/shared/contracts/plans';

const scanCounter: UsageCounterState = {
  key: 'scanner.scan',
  label: 'مسح رمز',
  window: 'daily',
  cap: 5,
  used: 4,
  remaining: 1,
};

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  expiresAt: null,
  counters: [scanCounter],
};

function makeRepository(overrides: Partial<UsageRepository> = {}): UsageRepository {
  return {
    getSettings: vi.fn(),
    listLimits: vi.fn(async () => [
      { key: 'habits', label: 'العادات', visitorCap: 1, freeCap: 5, proCap: 50, sortOrder: 10 },
    ]),
    listCounters: vi.fn(async () => [
      {
        key: 'scanner.scan',
        label: 'مسح رمز',
        window: 'daily' as const,
        visitorCap: 1,
        freeCap: 5,
        proCap: 50,
        sortOrder: 30,
      },
    ]),
    listQuotas: vi.fn(async () => []),
    newsCardCap: vi.fn(async () => 5),
    getState: vi.fn(async () => freeState),
    getOwnedItemStates: vi.fn(async () => [
      { key: 'habits' as const, label: 'العادات', cap: 5, used: 2, remaining: 3 },
    ]),
    listActivations: vi.fn(async () => []),
    record: vi.fn(async () => ({
      allowed: true,
      duplicate: false,
      eventId: 'event-1',
      state: { ...scanCounter, used: 5, remaining: 0 },
    })),
    release: vi.fn(async () => true),
    countOwned: vi.fn(async () => 0),
    activate: vi.fn(async () => ({
      plan: 'pro' as const,
      expiresAt: '2026-11-21T12:00:00.000Z',
      days: 30,
    })),
    userExists: vi.fn(async () => true),
    listUsers: vi.fn(),
    ...overrides,
  };
}

describe('UsageService', () => {
  it('passes the reported state through unchanged', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await expect(service.state('user-1')).resolves.toEqual(freeState);
    expect(repository.getState).toHaveBeenCalledWith('user-1');
  });

  it('serves the allowance and the grant history together', async () => {
    const repository = makeRepository({
      listActivations: vi.fn(async () => [
        {
          id: 'a1',
          plan: 'pro' as const,
          amountCents: 1000,
          currency: 'USD',
          method: 'shamcash' as const,
          note: null,
          activatedAt: '2026-10-22T12:00:00.000Z',
          expiresAt: '2026-11-21T12:00:00.000Z',
        },
      ]),
    });
    const service = new UsageService(repository);

    await expect(service.myPlan('user-1')).resolves.toMatchObject({
      state: freeState,
      limits: [{ key: 'habits', used: 2, cap: 5 }],
      activations: [{ id: 'a1', amountCents: 1000 }],
    });
  });

  it('reads the cap for the plan the user is on', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await expect(service.ownedItemCap('habits', 'free')).resolves.toBe(5);
    await expect(service.ownedItemCap('habits', 'pro')).resolves.toBe(50);
  });

  it('refuses a cap key that no plan defines', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await expect(service.ownedItemCap('expenses', 'free')).rejects.toThrow(
      'Unknown owned-item cap: expenses'
    );
  });

  it('records the activating admin on a grant', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await service.activate(
      { userId: 'user-1', amountCents: 1000, method: 'shamcash', note: 'وصلت' },
      'admin-1'
    );

    expect(repository.activate).toHaveBeenCalledWith({
      userId: 'user-1',
      amountCents: 1000,
      method: 'shamcash',
      note: 'وصلت',
      activatedBy: 'admin-1',
    });
  });

  it('refuses to activate a user that does not exist', async () => {
    const repository = makeRepository({ userExists: vi.fn(async () => false) });
    const service = new UsageService(repository);

    await expect(
      service.activate({ userId: 'ghost', amountCents: 0, method: 'other' }, 'admin-1')
    ).rejects.toBeInstanceOf(PlanTargetNotFoundError);
    expect(repository.activate).not.toHaveBeenCalled();
  });

  it('counts an action and keeps the count on success', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await expect(
      service.runCounted({ userId: 'user-1' }, 'scanner.scan', async () => 'done')
    ).resolves.toBe('done');
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('releases the count and rethrows when the action fails', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);
    const failure = new Error('write failed');

    await expect(
      service.runCounted({ userId: 'user-1' }, 'downloader.job.create', async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(repository.release).toHaveBeenCalledWith('user-1', 'event-1');
  });

  it('does not run the action at all when the allowance is used up', async () => {
    const repository = makeRepository({
      record: vi.fn(async () => ({
        allowed: false,
        duplicate: false,
        eventId: null,
        state: { ...scanCounter, used: 5, remaining: 0 },
      })),
    });
    const service = new UsageService(repository);
    const run = vi.fn(async () => 'never');

    await expect(
      service.runCounted({ userId: 'user-1' }, 'downloader.job.create', run)
    ).rejects.toBeInstanceOf(UsageLimitReachedError);
    expect(run).not.toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('tells a visitor to sign in, not to upgrade, when their allowance is used up', async () => {
    const repository = makeRepository({
      record: vi.fn(async () => ({
        allowed: false,
        duplicate: false,
        eventId: null,
        state: { ...scanCounter, cap: 1, used: 1, remaining: 0 },
      })),
    });
    const service = new UsageService(repository);

    const error = await service
      .runCounted(
        { userId: null, visitorKey: 'visitor-1', ipHash: 'hash' },
        'downloader.job.create',
        async () => 'never'
      )
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(UsageLimitReachedError);
    expect(error).toMatchObject({ statusCode: 402, code: 'visitor_limit' });
  });

  it('refuses a create at the standing cap before anything is written', async () => {
    const repository = makeRepository({ countOwned: vi.fn(async () => 5) });
    const service = new UsageService(repository);

    const error = await service.assertOwnedItemCap('user-1', 'habits').catch((err) => err);

    expect(error).toBeInstanceOf(OwnedItemCapReachedError);
    expect(error).toMatchObject({ statusCode: 402, code: 'owned_item_cap', cap: 5, count: 5 });
  });

  it('lets a create through while a slot is free, and counts a batch against it', async () => {
    const repository = makeRepository({ countOwned: vi.fn(async () => 3) });
    const service = new UsageService(repository);

    await expect(service.assertOwnedItemCap('user-1', 'habits')).resolves.toEqual(freeState);
    await expect(service.assertOwnedItemCap('user-1', 'habits', 2)).resolves.toEqual(freeState);
    await expect(service.assertOwnedItemCap('user-1', 'habits', 3)).rejects.toBeInstanceOf(
      OwnedItemCapReachedError
    );
  });

  it('exempts an Admin from the cap without counting anything', async () => {
    const repository = makeRepository({
      getState: vi.fn(async () => ({ ...freeState, unlimited: true })),
      countOwned: vi.fn(async () => 9),
    });
    const service = new UsageService(repository);

    await expect(service.assertOwnedItemCap('admin-1', 'habits', 5)).resolves.toMatchObject({
      unlimited: true,
    });
    expect(repository.countOwned).not.toHaveBeenCalled();
  });

  it('resolves the caps and the counter allowances for the account plan', async () => {
    const repository = makeRepository({
      getState: vi.fn(async () => ({ ...freeState, plan: 'pro' as const })),
    });
    const service = new UsageService(repository);

    await expect(service.caps('user-1')).resolves.toEqual({
      plan: 'pro',
      unlimited: false,
      caps: { habits: 50 },
      counters: { 'scanner.scan': { window: 'daily', cap: 50 } },
    });
  });

  it('reports local counters once each and says what was refused', async () => {
    const repository = makeRepository({
      record: vi
        .fn()
        .mockResolvedValueOnce({
          allowed: true,
          duplicate: false,
          eventId: 'event-1',
          state: scanCounter,
        })
        .mockResolvedValueOnce({
          allowed: true,
          duplicate: true,
          eventId: null,
          state: scanCounter,
        })
        .mockResolvedValueOnce({
          allowed: false,
          duplicate: false,
          eventId: null,
          state: { ...scanCounter, used: 5, remaining: 0 },
        }),
    });
    const service = new UsageService(repository);

    await expect(
      service.reportLocalUsage('user-1', {
        events: [
          { clientEventId: '11111111-1111-7111-8111-111111111111', actionKey: 'scanner.scan' },
          { clientEventId: '22222222-2222-7222-8222-222222222222', actionKey: 'quran.surah.read' },
          { clientEventId: '33333333-3333-7333-8333-333333333333', actionKey: 'scanner.scan' },
        ],
      })
    ).resolves.toMatchObject({ recorded: 1, alreadyRecorded: 1, refused: 1 });
  });
});
