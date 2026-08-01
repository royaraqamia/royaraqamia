import type { INotificationRepository } from '@/backend/ports/notifications/interfaces';
import type { Notification, NotificationCreateInput } from '@/backend/models/notifications';
import { checkRateLimit } from '@/backend/shared/rate-limiter';

export function createNotificationService(repo: INotificationRepository) {
  return {
    async getNotifications(
      userId: string,
      limit?: number,
      offset?: number
    ): Promise<Notification[]> {
      return repo.findByUserId(userId, limit, offset);
    },

    async getUnreadCount(userId: string): Promise<number> {
      return repo.findUnreadCount(userId);
    },

    async create(input: NotificationCreateInput): Promise<Notification> {
      const rateKey = `notify:${input.user_id}`;
      if (!checkRateLimit(rateKey, 100, 3600_000)) {
        throw new Error('تم تجاوز الحد الأقصى للإشعارات في الساعة');
      }
      return repo.create(input);
    },

    async markAsRead(id: string, userId: string): Promise<void> {
      return repo.markAsRead(id, userId);
    },

    async markAllAsRead(userId: string): Promise<void> {
      return repo.markAllAsRead(userId);
    },

    async delete(id: string, userId: string): Promise<void> {
      return repo.delete(id, userId);
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
