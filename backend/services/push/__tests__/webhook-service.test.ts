import { describe, it, expect, vi } from 'vitest';
import { PushWebhookService } from '@/backend/services/push/webhook-service';
import { damascusDateKey } from '@/shared/time';
import type { Notification } from '@/shared/contracts/notifications';
import type { PushPayload } from '@/shared/contracts/push';

const n1 = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';
const n2 = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

function row(overrides: Partial<Notification> = {}): Notification {
  return {
    id: n1,
    user_id: 'u-1',
    type: 'habit_reminder',
    title: 'تذكير بعادتك اليومية',
    body: 'لا تنسَ إنجاز عادتك اليوم: المشي',
    metadata: { habit_id: 'h-1', habit_name: 'المشي' },
    is_read: false,
    created_at: '2026-10-30T21:30:00.000Z',
    read_at: null,
    ...overrides,
  };
}

function makeService(rows: Notification[]) {
  const findByIds = vi.fn(async (_ids: string[]) => rows);
  const notifier = {
    sendToUser: vi.fn(async (_userId: string, _payload: PushPayload) => undefined),
    sendToUsers: vi.fn(async (_userIds: string[], _payload: PushPayload) => undefined),
  };
  const checkRateLimit = vi.fn(async () => true);
  const schedule = vi.fn((fn: () => void | Promise<void>) => {
    void fn();
  });
  const dateKey = vi.fn(() => '2026-10-31');
  const service = new PushWebhookService({
    notifications: { findByIds },
    notifier,
    checkRateLimit,
    schedule,
    dateKey,
  });
  return { service, findByIds, notifier, checkRateLimit, schedule, dateKey };
}

describe('PushWebhookService', () => {
  it('reads the stored rows and derives title, body and URL from them', async () => {
    const stored = row({ title: 'عنوان مخزَّن', body: 'نص مخزَّن' });
    const { service, findByIds, notifier } = makeService([stored]);

    const result = await service.handle([n1]);

    expect(result).toEqual({ notified: 1 });
    expect(findByIds).toHaveBeenCalledWith([n1]);
    expect(notifier.sendToUsers).toHaveBeenCalledWith(
      ['u-1'],
      expect.objectContaining({
        title: 'عنوان مخزَّن',
        body: 'نص مخزَّن',
        url: '/habitflow',
        type: 'habit_reminder',
      })
    );
  });

  it('passes a changed stored title through to the push', async () => {
    const changed = row({ id: n2, user_id: 'u-2', title: 'عنوان مختلف' });
    const { service, notifier } = makeService([row(), changed]);

    await service.handle([n1, n2]);

    const titles = notifier.sendToUsers.mock.calls.map((call) => call[1]?.title);
    expect(titles).toContain('تذكير بعادتك اليومية');
    expect(titles).toContain('عنوان مختلف');
  });

  it('groups users who share a stored payload into one dispatch', async () => {
    const { service, notifier } = makeService([row(), row({ id: n2, user_id: 'u-2' })]);

    await service.handle([n1, n2]);

    expect(notifier.sendToUsers).toHaveBeenCalledTimes(1);
    expect(notifier.sendToUsers.mock.calls[0]?.[0]).toEqual(['u-1', 'u-2']);
  });

  it('dedupes users, not notification rows, before claiming a day', async () => {
    const { service, checkRateLimit, notifier } = makeService([
      row({ id: n2, user_id: 'u-1' }),
      row(),
    ]);

    const result = await service.handle([n1, n2, n1]);

    expect(result.notified).toBe(1);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith(
      'push:habit:u-1:2026-10-31',
      1,
      24 * 60 * 60 * 1000
    );
    expect(notifier.sendToUsers.mock.calls[0]?.[0]).toEqual(['u-1']);
  });

  it('does not schedule anything when every user was already notified', async () => {
    const { service, checkRateLimit, schedule, notifier } = makeService([row()]);
    checkRateLimit.mockResolvedValue(false);

    const result = await service.handle([n1]);

    expect(result.notified).toBe(0);
    expect(schedule).not.toHaveBeenCalled();
    expect(notifier.sendToUsers).not.toHaveBeenCalled();
  });

  it('ignores ids that do not resolve to a stored row', async () => {
    const { service, checkRateLimit } = makeService([]);

    expect(await service.handle([n1])).toEqual({ notified: 0 });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  describe('the dedupe day is the Damascus day', () => {
    it('collapses two runs on the same Damascus day', async () => {
      const stored = [row()];
      const claimed = new Set<string>();
      const checkRateLimit = vi.fn(async (key: string) => {
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      });
      const notifier = { sendToUser: vi.fn(), sendToUsers: vi.fn() };
      const make = () =>
        new PushWebhookService({
          notifications: { findByIds: vi.fn(async () => stored) },
          notifier,
          checkRateLimit,
          schedule: (fn) => void fn(),
          dateKey: damascusDateKey,
        });

      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-10-30T21:30:00Z'));
        expect((await make().handle([n1])).notified).toBe(1);
        vi.setSystemTime(new Date('2026-10-30T23:30:00Z'));
        expect((await make().handle([n1])).notified).toBe(0);
      } finally {
        vi.useRealTimers();
      }

      expect(checkRateLimit).toHaveBeenCalledWith(
        'push:habit:u-1:2026-10-31',
        1,
        24 * 60 * 60 * 1000
      );
      expect(notifier.sendToUsers).toHaveBeenCalledTimes(1);
    });

    it('notifies again when the runs straddle Damascus midnight', async () => {
      const claimed = new Set<string>();
      const checkRateLimit = vi.fn(async (key: string) => {
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      });
      const make = () =>
        new PushWebhookService({
          notifications: { findByIds: vi.fn(async () => [row()]) },
          notifier: { sendToUser: vi.fn(), sendToUsers: vi.fn() },
          checkRateLimit,
          schedule: (fn) => void fn(),
          dateKey: damascusDateKey,
        });

      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-10-30T20:59:00Z'));
        expect((await make().handle([n1])).notified).toBe(1);
        vi.setSystemTime(new Date('2026-10-30T21:01:00Z'));
        expect((await make().handle([n1])).notified).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
