import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_SUBSCRIPTIONS_PER_USER,
  PushSubscriptionService,
} from '@/backend/services/push/subscription-service';
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/backend/repositories/push/push-subscriptions-repository';

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn() }));

vi.mock('@/backend/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const endpoint = (n: number) => `https://wns2.notify.windows.com/w/?token=${n}`;

function makeRecord(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    id: 'sub-1',
    userId: 'u-1',
    endpoint: endpoint(1),
    p256dh: 'p256',
    auth: 'auth',
    userAgent: null,
    createdAt: '2026-08-16T08:00:00.000Z',
    updatedAt: '2026-08-16T08:00:00.000Z',
    ...overrides,
  };
}

function makeRepository(rows: PushSubscriptionRecord[]) {
  const repository: PushSubscriptionRepository = {
    upsert: vi.fn(async () => undefined),
    touch: vi.fn(async () => undefined),
    findByUserId: vi.fn(async () => rows),
    findForUsers: vi.fn(async () => []),
    removeByEndpoint: vi.fn(async () => undefined),
    removeEndpoint: vi.fn(async () => undefined),
  };
  return repository;
}

const input = {
  endpoint: endpoint(99),
  p256dh: 'p256',
  auth: 'auth',
  userAgent: null,
};

describe('PushSubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the endpoint with the session user id', async () => {
    const repository = makeRepository([]);
    const service = new PushSubscriptionService({ repository });

    await service.subscribe('u-1', input);

    expect(repository.upsert).toHaveBeenCalledWith('u-1', input);
  });

  it('leaves a list under the cap untouched', async () => {
    const rows = Array.from({ length: MAX_SUBSCRIPTIONS_PER_USER }, (_, i) =>
      makeRecord({ id: `sub-${i}`, endpoint: endpoint(i) })
    );
    const repository = makeRepository(rows);
    const service = new PushSubscriptionService({ repository });

    await service.subscribe('u-1', input);

    expect(repository.removeEndpoint).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('drops the oldest rotation debris past the cap', async () => {
    const rows = Array.from({ length: MAX_SUBSCRIPTIONS_PER_USER + 3 }, (_, i) =>
      makeRecord({
        id: `sub-${i}`,
        endpoint: endpoint(i),
        updatedAt: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
      })
    );
    const repository = makeRepository(rows);
    const service = new PushSubscriptionService({ repository });

    await service.subscribe('u-1', input);

    expect(repository.removeEndpoint).toHaveBeenCalledTimes(3);
    expect(repository.removeEndpoint).toHaveBeenNthCalledWith(1, endpoint(0));
    expect(repository.removeEndpoint).toHaveBeenNthCalledWith(2, endpoint(1));
    expect(repository.removeEndpoint).toHaveBeenNthCalledWith(3, endpoint(2));
  });

  it('never trims the endpoint it was just told to store', async () => {
    const rows = Array.from({ length: MAX_SUBSCRIPTIONS_PER_USER + 1 }, (_, i) =>
      makeRecord({
        id: `sub-${i}`,
        endpoint: endpoint(i),
        // The just-subscribed row carries the oldest date here on purpose: the
        // cap must key on identity, not on a timestamp a clock could invert.
        updatedAt:
          i === 0 ? '2020-01-01T00:00:00.000Z' : new Date(Date.UTC(2026, 7, i)).toISOString(),
      })
    );
    const repository = makeRepository(rows);
    const service = new PushSubscriptionService({ repository });

    await service.subscribe('u-1', { ...input, endpoint: endpoint(0) });

    expect(repository.removeEndpoint).not.toHaveBeenCalledWith(endpoint(0));
    expect(repository.removeEndpoint).toHaveBeenCalledTimes(1);
  });

  it('still stores the subscription when the trim read fails', async () => {
    const repository = makeRepository([]);
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const service = new PushSubscriptionService({ repository });

    await expect(service.subscribe('u-1', input)).resolves.toBeUndefined();
    expect(repository.upsert).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to read push subscriptions for trimming',
      expect.objectContaining({ userId: 'u-1' })
    );
  });

  it('does not fail the subscribe when one delete fails', async () => {
    const rows = Array.from({ length: MAX_SUBSCRIPTIONS_PER_USER + 1 }, (_, i) =>
      makeRecord({
        id: `sub-${i}`,
        endpoint: endpoint(i),
        updatedAt: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
      })
    );
    const repository = makeRepository(rows);
    (repository.removeEndpoint as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const service = new PushSubscriptionService({ repository });

    await expect(service.subscribe('u-1', input)).resolves.toBeUndefined();
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to trim old push subscriptions',
      expect.objectContaining({ userId: 'u-1', failed: 1 })
    );
  });
});
