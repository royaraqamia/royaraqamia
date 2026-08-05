import { describe, it, expect, vi } from 'vitest';
import {
  NotificationService,
  type NotificationServiceDeps,
} from '@/backend/services/notifications/notification-service';
import type { NotificationRepository } from '@/backend/repositories/notifications/notifications-repository';
import type { Notification } from '@/shared/contracts/notifications';

const notificationFixture: Notification = {
  id: 'n-1',
  user_id: 'u-1',
  type: 'certificate_issued',
  title: 'شهادة جديدة',
  body: null,
  metadata: {},
  is_read: false,
  created_at: '2026-08-02T08:00:00.000Z',
  read_at: null,
};

function makeDeps(overrides: { checkRateLimit?: ReturnType<typeof vi.fn> } = {}) {
  const repository: NotificationRepository = {
    findByUserId: vi.fn(),
    findUnreadCount: vi.fn(),
    create: vi.fn(),
    broadcast: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    delete: vi.fn(),
  };
  const checkRateLimit = overrides.checkRateLimit ?? vi.fn(async () => true);
  const service = new NotificationService(repository, {
    checkRateLimit: checkRateLimit as NotificationServiceDeps['checkRateLimit'],
  });
  return { repository, checkRateLimit, service };
}

describe('NotificationService', () => {
  describe('read operations (delegation)', () => {
    it('delegates getNotifications with limit and offset', async () => {
      const { repository, service } = makeDeps();
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([
        notificationFixture,
      ]);

      await expect(service.getNotifications('u-1', 10, 5)).resolves.toEqual([notificationFixture]);
      expect(repository.findByUserId).toHaveBeenCalledWith('u-1', 10, 5);
    });

    it('delegates getUnreadCount', async () => {
      const { repository, service } = makeDeps();
      (repository.findUnreadCount as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      await expect(service.getUnreadCount('u-1')).resolves.toBe(3);
    });
  });

  describe('create', () => {
    it('creates a notification when under the rate limit', async () => {
      const { repository, checkRateLimit, service } = makeDeps();
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue(notificationFixture);

      const input = { user_id: 'u-1', type: 'certificate_issued' as const, title: 'شهادة جديدة' };
      await expect(service.create(input)).resolves.toBe(notificationFixture);
      expect(checkRateLimit).toHaveBeenCalledWith('notify:u-1', 100, 3600_000);
      expect(repository.create).toHaveBeenCalledWith(input);
    });

    it('throws when the rate limit is exceeded', async () => {
      const { repository, service } = makeDeps({ checkRateLimit: vi.fn(async () => false) });

      await expect(
        service.create({ user_id: 'u-1', type: 'expense_alert', title: 'تنبيه' })
      ).rejects.toThrow('تم تجاوز الحد الأقصى للإشعارات في الساعة');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('fans out to every user when findAllUserIds is provided', async () => {
      const repository: NotificationRepository = {
        findByUserId: vi.fn(),
        findUnreadCount: vi.fn(),
        create: vi.fn(),
        broadcast: vi.fn(async (_input, userIds) => userIds.length),
        markAsRead: vi.fn(),
        markAllAsRead: vi.fn(),
        delete: vi.fn(),
      };
      const findAllUserIds = vi.fn(async () => ['u-1', 'u-2', 'u-3']);
      const service = new NotificationService(repository, {
        checkRateLimit: vi.fn(async () => true) as NotificationServiceDeps['checkRateLimit'],
        findAllUserIds,
      });

      await expect(
        service.broadcast({ type: 'system_announcement', title: 'إعلان', body: 'نص' })
      ).resolves.toBe(3);
      expect(findAllUserIds).toHaveBeenCalledTimes(1);
      expect(repository.broadcast).toHaveBeenCalledWith(
        { type: 'system_announcement', title: 'إعلان', body: 'نص' },
        ['u-1', 'u-2', 'u-3']
      );
    });

    it('returns 0 (no-op) when findAllUserIds is not provided', async () => {
      const { repository, service } = makeDeps();
      (repository.broadcast as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await expect(
        service.broadcast({ type: 'system_announcement', title: 'إعلان' })
      ).resolves.toBe(0);
      expect(repository.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('mutations (delegation)', () => {
    it('delegates markAsRead', async () => {
      const { repository, service } = makeDeps();
      (repository.markAsRead as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.markAsRead('n-1', 'u-1');
      expect(repository.markAsRead).toHaveBeenCalledWith('n-1', 'u-1');
    });

    it('delegates markAllAsRead', async () => {
      const { repository, service } = makeDeps();
      (repository.markAllAsRead as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.markAllAsRead('u-1');
      expect(repository.markAllAsRead).toHaveBeenCalledWith('u-1');
    });

    it('delegates delete', async () => {
      const { repository, service } = makeDeps();
      (repository.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.delete('n-1', 'u-1');
      expect(repository.delete).toHaveBeenCalledWith('n-1', 'u-1');
    });
  });
});
