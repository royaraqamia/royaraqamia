import { describe, expect, it, vi } from 'vitest';
import { hashAnonymousSubject, PlanGate } from '@/backend/services/plans/plan-gate';
import { UsageService } from '@/backend/services/plans/usage-service';
import type { UsageRepository } from '@/backend/repositories/plans/usage-repository';
import type { UsageState } from '@/shared/contracts/plans';

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  cap: 100,
  spent: 0,
  remaining: 100,
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
    listActivations: vi.fn(async () => []),
    spend: vi.fn(async () => ({
      allowed: true as const,
      state: freeState,
      cost: 1,
      eventId: 'event-1',
    })),
    spendOnce: vi.fn(async () => ({
      allowed: true as const,
      state: freeState,
      cost: 1,
      eventId: 'event-2',
    })),
    spendAnonymous: vi.fn(async () => ({
      allowed: true as const,
      cap: 10,
      spent: 1,
      remaining: 9,
      cost: 1,
      eventId: 'event-3',
    })),
    countOwned: vi.fn(async () => 0),
    refund: vi.fn(async () => true),
    refundAnonymous: vi.fn(async () => true),
    activate: vi.fn(),
    userExists: vi.fn(async () => true),
    listUsers: vi.fn(),
    ...overrides,
  };
}

function makeGate(overrides: Partial<UsageRepository> = {}) {
  const repository = makeRepository(overrides);
  return { repository, gate: new PlanGate(new UsageService(repository)) };
}

describe('PlanGate', () => {
  it('spends the signed-in user allowance and runs the action', async () => {
    const { repository, gate } = makeGate();

    await expect(
      gate.meter({ userId: 'user-1', ip: '1.1.1.1' }, 'linksnap.link.create', async () => 'ok')
    ).resolves.toBe('ok');
    expect(repository.spend).toHaveBeenCalledWith('user-1', 'linksnap.link.create');
    expect(repository.spendAnonymous).not.toHaveBeenCalled();
  });

  it('spends the visitor allowance against a salted hash, never the address', async () => {
    const { repository, gate } = makeGate();

    await gate.meter(
      { userId: null, ip: '203.0.113.7' },
      'downloader.job.create',
      async () => 'ok'
    );

    const [subject] = vi.mocked(repository.spendAnonymous).mock.calls[0] ?? [];
    expect(subject).toBe(hashAnonymousSubject('203.0.113.7'));
    expect(subject).not.toContain('203.0.113.7');
  });

  it('refuses to meter a subject it cannot identify', async () => {
    const { gate } = makeGate();

    await expect(
      gate.meter({ userId: null, ip: null }, 'scanner.scan', async () => 'never')
    ).rejects.toThrow('A metered action needs a signed-in user or a client address.');
  });

  it('refunds every unit of a bulk spend when the action fails', async () => {
    const { repository, gate } = makeGate();
    const failure = new Error('bulk failed');

    await expect(
      gate.meterMany('user-1', 'community.post.publish', 3, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(repository.spend).toHaveBeenCalledTimes(3);
    expect(repository.refund).toHaveBeenCalledTimes(3);
  });

  it('checks the standing cap through the service', async () => {
    const { repository, gate } = makeGate({ countOwned: vi.fn(async () => 5) });

    await expect(gate.cap('user-1', 'habits')).rejects.toMatchObject({
      statusCode: 402,
      code: 'owned_item_cap',
    });
    expect(repository.spend).not.toHaveBeenCalled();
  });
});
