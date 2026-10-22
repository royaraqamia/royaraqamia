import { describe, expect, it, vi } from 'vitest';
import {
  AnonymousAllowanceExhaustedError,
  InsufficientCreditsError,
  PlanTargetNotFoundError,
  UsageService,
} from '@/backend/services/plans/usage-service';
import type { UsageRepository } from '@/backend/repositories/plans/usage-repository';
import type { UsageState } from '@/shared/contracts/plans';

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  cap: 100,
  spent: 40,
  remaining: 60,
  windowDays: 30,
  expiresAt: null,
};

function makeRepository(overrides: Partial<UsageRepository> = {}): UsageRepository {
  return {
    getSettings: vi.fn(),
    listLimits: vi.fn(async () => [
      { key: 'habits', label: 'العادات', freeCap: 5, proCap: 200, sortOrder: 10 },
    ]),
    listActionCosts: vi.fn(),
    getState: vi.fn(async () => freeState),
    spend: vi.fn(async () => ({
      allowed: true as const,
      state: freeState,
      cost: 10,
      eventId: 'event-1',
    })),
    spendAnonymous: vi.fn(async () => ({
      allowed: true as const,
      cap: 10,
      spent: 1,
      remaining: 9,
      cost: 1,
      eventId: 'event-2',
    })),
    refund: vi.fn(async () => true),
    refundAnonymous: vi.fn(async () => true),
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

  it('reads the cap for the plan the user is on', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await expect(service.ownedItemCap('habits', 'free')).resolves.toBe(5);
    await expect(service.ownedItemCap('habits', 'pro')).resolves.toBe(200);
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

  it('runs a metered action and keeps the reservation on success', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);

    await expect(
      service.runMetered('user-1', 'linksnap.link.create', async () => 'done')
    ).resolves.toBe('done');
    expect(repository.refund).not.toHaveBeenCalled();
  });

  it('refunds the reservation and rethrows when the action fails', async () => {
    const repository = makeRepository();
    const service = new UsageService(repository);
    const failure = new Error('write failed');

    await expect(
      service.runMetered('user-1', 'community.post.publish', async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(repository.refund).toHaveBeenCalledWith('user-1', 'event-1');
  });

  it('does not run the action at all when the allowance is spent', async () => {
    const repository = makeRepository({
      spend: vi.fn(async () => ({
        allowed: false as const,
        state: { ...freeState, remaining: 0 },
        cost: 10,
        eventId: null,
      })),
    });
    const service = new UsageService(repository);
    const run = vi.fn(async () => 'never');

    await expect(service.runMetered('user-1', 'downloader.job.create', run)).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
    expect(run).not.toHaveBeenCalled();
    expect(repository.refund).not.toHaveBeenCalled();
  });

  it('tells a visitor to sign in, not to upgrade, when their day is spent', async () => {
    const repository = makeRepository({
      spendAnonymous: vi.fn(async () => ({
        allowed: false as const,
        cap: 10,
        spent: 10,
        remaining: 0,
        cost: 5,
        eventId: null,
      })),
    });
    const service = new UsageService(repository);

    const error = await service
      .runMeteredAnonymous('hash', 'downloader.job.create', async () => 'never')
      .catch((err) => err);

    expect(error).toBeInstanceOf(AnonymousAllowanceExhaustedError);
    expect(error).toMatchObject({ statusCode: 402, code: 'anonymous_limit', remaining: 0 });
  });
});
