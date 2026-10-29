import { describe, expect, it, vi } from 'vitest';
import { hashAnonymousSubject, PlanGate } from '@/backend/services/plans/plan-gate';
import { UsageService } from '@/backend/services/plans/usage-service';
import type { UsageRepository } from '@/backend/repositories/plans/usage-repository';
import type { UsageCounterState, UsageState } from '@/shared/contracts/plans';

const downloadCounter: UsageCounterState = {
  key: 'downloader.job.create',
  label: 'تنزيل وسائط',
  window: 'lifetime',
  cap: 5,
  used: 1,
  remaining: 4,
};

const freeState: UsageState = {
  plan: 'free',
  unlimited: false,
  expiresAt: null,
  counters: [downloadCounter],
};

function makeRepository(overrides: Partial<UsageRepository> = {}): UsageRepository {
  return {
    getSettings: vi.fn(),
    listLimits: vi.fn(async () => [
      { key: 'habits', label: 'العادات', freeCap: 5, proCap: 50, sortOrder: 10 },
    ]),
    listCounters: vi.fn(async () => []),
    getState: vi.fn(async () => freeState),
    listActivations: vi.fn(async () => []),
    record: vi.fn(async () => ({
      allowed: true,
      duplicate: false,
      eventId: 'event-1',
      state: downloadCounter,
    })),
    release: vi.fn(async () => true),
    countOwned: vi.fn(async () => 0),
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
  it('counts a signed-in action and runs the work', async () => {
    const { repository, gate } = makeGate();

    await expect(
      gate.count({ userId: 'user-1', ip: '1.1.1.1' }, 'downloader.job.create', async () => 'ok')
    ).resolves.toBe('ok');

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'downloader.job.create',
        userId: 'user-1',
        visitorKey: null,
      })
    );
  });

  it('counts a visitor against the cookie and the salted address, never the address', async () => {
    const { repository, gate } = makeGate();

    await gate.count(
      { userId: null, visitorKey: 'visitor-1', ip: '203.0.113.7' },
      'downloader.job.create',
      async () => 'ok'
    );

    const [input] = vi.mocked(repository.record).mock.calls[0] ?? [];
    expect(input?.visitorKey).toBe('visitor-1');
    expect(input?.ipHash).toBe(hashAnonymousSubject('203.0.113.7'));
    expect(input?.ipHash).not.toContain('203.0.113.7');
  });

  it('refuses to count a subject it cannot identify', async () => {
    const { gate } = makeGate();

    await expect(
      gate.count({ userId: null, ip: null }, 'scanner.scan', async () => 'never')
    ).rejects.toThrow('A counted action needs a signed-in user or a visitor.');
  });

  it('releases the count when the work behind it throws', async () => {
    const { repository, gate } = makeGate();
    const failure = new Error('busy');

    await expect(
      gate.count({ userId: 'user-1', ip: '1.1.1.1' }, 'downloader.job.create', async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(repository.release).toHaveBeenCalledWith('user-1', 'event-1');
  });

  it('claims one action without wrapping any work', async () => {
    const { repository, gate } = makeGate();

    await expect(
      gate.claim({ userId: 'user-1' }, 'news.digest.open', { dedupeKey: 'news:2026-10-29' })
    ).resolves.toBe('event-1');

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'news:2026-10-29' })
    );
  });

  it('checks the standing cap through the service', async () => {
    const { repository, gate } = makeGate({ countOwned: vi.fn(async () => 5) });

    await expect(gate.cap('user-1', 'habits')).rejects.toMatchObject({
      statusCode: 402,
      code: 'owned_item_cap',
    });
    expect(repository.record).not.toHaveBeenCalled();
  });
});
