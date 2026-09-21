import { describe, it, expect, vi } from 'vitest';
import {
  createAdminIdsResolver,
  createNotificationFanout,
  type NotificationDelivery,
  type NotificationFanoutDeps,
  type PushNotifier,
} from '@/backend/config/notifications';
import { createConcurrencyLimiter } from '@/backend/shared/concurrency-limiter';
import type { NotificationBroadcastInput } from '@/backend/repositories/notifications/notifications-repository';

const input: NotificationBroadcastInput = {
  type: 'training_application',
  title: 'طلب التحاق جديد بالدورة',
  body: 'أحمد — دورة (TRN-2026-A7K2M9QX)',
};

function makeFanout(
  options: {
    deliver?: NotificationDelivery['broadcast'];
    push?: PushNotifier['sendToUsers'];
    resolveAdminIds?: () => Promise<string[]>;
    resolveAllUserIds?: () => Promise<string[]>;
    filterExistingUserIds?: (ids: string[]) => Promise<string[]>;
    limiter?: NotificationFanoutDeps['limiter'];
  } = {}
) {
  const broadcast = vi.fn(options.deliver ?? (async (_input, userIds) => userIds.length));
  const sendToUsers = vi.fn(options.push ?? (async () => undefined));
  const resolveAdminIds = vi.fn(options.resolveAdminIds ?? (async () => [] as string[]));
  const resolveAllUserIds = vi.fn(options.resolveAllUserIds ?? (async () => [] as string[]));
  const filterExistingUserIds = vi.fn(
    options.filterExistingUserIds ?? (async (ids: string[]) => ids)
  );

  const scheduled: Array<Promise<void>> = [];
  const fanout = createNotificationFanout({
    deliver: { broadcast },
    push: { sendToUsers },
    resolveAdminIds,
    resolveAllUserIds,
    filterExistingUserIds,
    limiter: options.limiter,
    schedule: (task) => {
      scheduled.push(Promise.resolve(task()));
    },
  });

  return {
    fanout,
    broadcast,
    sendToUsers,
    resolveAdminIds,
    resolveAllUserIds,
    filterExistingUserIds,
    flush: async () => {
      await Promise.all(scheduled);
    },
  };
}

describe('createNotificationFanout', () => {
  it('fans an untargeted notification out to the Admin audience once, not once per Admin', async () => {
    const { fanout, broadcast, sendToUsers, resolveAdminIds, flush } = makeFanout({
      resolveAdminIds: async () => ['admin-1', 'admin-2', 'admin-3'],
    });

    await expect(fanout(input)).resolves.toBe(3);
    await flush();

    expect(resolveAdminIds).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(input, ['admin-1', 'admin-2', 'admin-3']);
    expect(sendToUsers).toHaveBeenCalledTimes(1);
    expect(sendToUsers).toHaveBeenCalledWith(
      ['admin-1', 'admin-2', 'admin-3'],
      expect.objectContaining({
        title: input.title,
        body: input.body,
        type: 'training_application',
      })
    );
  });

  it("resolves every user when the delivery intent asks for the 'all' audience", async () => {
    const { fanout, broadcast, resolveAdminIds, resolveAllUserIds } = makeFanout({
      resolveAdminIds: async () => ['admin-1'],
      resolveAllUserIds: async () => ['u-1', 'u-2'],
    });

    await expect(fanout(input, { audience: 'all' })).resolves.toBe(2);

    expect(resolveAllUserIds).toHaveBeenCalledTimes(1);
    expect(resolveAdminIds).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(input, ['u-1', 'u-2']);
  });

  it('filters explicit recipients to existing users and skips the Admin lookup', async () => {
    const { fanout, broadcast, filterExistingUserIds, resolveAdminIds } = makeFanout({
      filterExistingUserIds: async () => ['u-1'],
    });

    await expect(fanout(input, { recipientIds: ['u-1', 'u-stale', 'u-1'] })).resolves.toBe(1);

    expect(filterExistingUserIds).toHaveBeenCalledWith(['u-1', 'u-stale']);
    expect(resolveAdminIds).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(input, ['u-1']);
  });

  it('subtracts the exclusion set from the resolved audience', async () => {
    const { fanout, broadcast } = makeFanout({
      resolveAdminIds: async () => ['admin-1', 'author', 'admin-2'],
    });

    await expect(fanout(input, { excludeUserIds: ['author'] })).resolves.toBe(2);

    expect(broadcast).toHaveBeenCalledWith(input, ['admin-1', 'admin-2']);
  });

  it('subtracts the exclusion set from explicit recipients too', async () => {
    const { fanout, broadcast } = makeFanout();

    await fanout(input, { recipientIds: ['u-1', 'u-2'], excludeUserIds: ['u-2'] });

    expect(broadcast).toHaveBeenCalledWith(input, ['u-1']);
  });

  it('delivers nothing when the resolved target set is empty', async () => {
    const { fanout, broadcast, sendToUsers } = makeFanout({
      resolveAdminIds: async () => [],
    });

    await expect(fanout(input)).resolves.toBe(0);

    expect(broadcast).not.toHaveBeenCalled();
    expect(sendToUsers).not.toHaveBeenCalled();
  });

  it('delivers nothing when every explicit recipient is excluded', async () => {
    const { fanout, broadcast } = makeFanout();

    await expect(fanout(input, { recipientIds: ['u-1'], excludeUserIds: ['u-1'] })).resolves.toBe(
      0
    );

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('does not fall back to the Admin audience when recipients are explicitly empty', async () => {
    const { fanout, broadcast, resolveAdminIds } = makeFanout({
      resolveAdminIds: async () => ['admin-1'],
    });

    await expect(fanout(input, { recipientIds: [] })).resolves.toBe(0);

    expect(resolveAdminIds).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('preserves the push deep-link derived from the notification metadata', async () => {
    const { fanout, sendToUsers, flush } = makeFanout();

    await fanout(
      {
        type: 'certificate_issued',
        title: 'شهادة',
        body: 'نص',
        metadata: { certificateCode: 'COMP-2026-ABCDEFGH' },
      },
      { recipientIds: ['u-1'] }
    );
    await flush();

    expect(sendToUsers).toHaveBeenCalledWith(
      ['u-1'],
      expect.objectContaining({ url: '/verify/COMP-2026-ABCDEFGH' })
    );
  });

  it('never throws and reports zero when the repository insert fails', async () => {
    const { fanout, sendToUsers } = makeFanout({
      deliver: async () => {
        throw new Error('db down');
      },
      resolveAdminIds: async () => ['admin-1'],
    });

    await expect(fanout(input)).resolves.toBe(0);
    expect(sendToUsers).not.toHaveBeenCalled();
  });

  it('never throws when resolving the audience fails', async () => {
    const { fanout } = makeFanout({
      resolveAdminIds: async () => {
        throw new Error('users down');
      },
    });

    await expect(fanout(input)).resolves.toBe(0);
  });

  it('swallows a push fan-out failure', async () => {
    const { fanout, flush } = makeFanout({
      push: async () => {
        throw new Error('push down');
      },
      resolveAdminIds: async () => ['admin-1'],
    });

    await expect(fanout(input)).resolves.toBe(1);
    await expect(flush()).resolves.toBeUndefined();
  });

  it('never runs more than five fan-outs at once', async () => {
    let active = 0;
    let peak = 0;
    const { fanout } = makeFanout({
      resolveAdminIds: async () => ['admin-1'],
      deliver: async (_input, userIds) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return userIds.length;
      },
    });

    await Promise.all(Array.from({ length: 16 }, () => fanout(input)));

    expect(peak).toBe(5);
  });

  it('bounds concurrency through an injected limiter', async () => {
    let active = 0;
    let peak = 0;
    const { fanout } = makeFanout({
      limiter: createConcurrencyLimiter(2),
      resolveAdminIds: async () => ['admin-1'],
      deliver: async (_input, userIds) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return userIds.length;
      },
    });

    await Promise.all(Array.from({ length: 8 }, () => fanout(input)));

    expect(peak).toBe(2);
  });
});

describe('createAdminIdsResolver', () => {
  it('reads the Admin audience once for a burst of calls within the cache window', async () => {
    const loadAdminIds = vi.fn(async () => ['admin-1', 'admin-2']);
    const resolveAdminIds = createAdminIdsResolver(loadAdminIds, {
      ttlMs: 60_000,
      now: () => 1_000,
    });

    const results = await Promise.all(Array.from({ length: 25 }, () => resolveAdminIds()));

    expect(loadAdminIds).toHaveBeenCalledTimes(1);
    for (const ids of results) expect(ids).toEqual(['admin-1', 'admin-2']);
  });

  it('re-reads once the cache window has elapsed', async () => {
    let clock = 1_000;
    const loadAdminIds = vi
      .fn()
      .mockResolvedValueOnce(['admin-1'])
      .mockResolvedValueOnce(['admin-1', 'admin-2']);
    const resolveAdminIds = createAdminIdsResolver(loadAdminIds, {
      ttlMs: 60_000,
      now: () => clock,
    });

    await expect(resolveAdminIds()).resolves.toEqual(['admin-1']);
    await expect(resolveAdminIds()).resolves.toEqual(['admin-1']);

    clock += 60_000;
    await expect(resolveAdminIds()).resolves.toEqual(['admin-1', 'admin-2']);
    expect(loadAdminIds).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed read', async () => {
    const loadAdminIds = vi
      .fn()
      .mockRejectedValueOnce(new Error('users down'))
      .mockResolvedValueOnce(['admin-1']);
    const resolveAdminIds = createAdminIdsResolver(loadAdminIds);

    await expect(resolveAdminIds()).rejects.toThrow('users down');
    await expect(resolveAdminIds()).resolves.toEqual(['admin-1']);
    expect(loadAdminIds).toHaveBeenCalledTimes(2);
  });
});
