import type { NotificationRepository } from '@/backend/repositories/notifications/notifications-repository';
import type { NotificationBroadcastInput } from '@/backend/repositories/notifications/notifications-repository';
import type { Notification, NotificationCreateInput } from '@/shared/contracts/notifications';

export interface NotificationServiceDeps {
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  findAllUserIds?: () => Promise<string[]>;
}

export class NotificationService {
  private readonly checkRateLimit: NotificationServiceDeps['checkRateLimit'];
  private readonly findAllUserIds?: NotificationServiceDeps['findAllUserIds'];

  constructor(
    private readonly repo: NotificationRepository,
    deps: NotificationServiceDeps
  ) {
    this.checkRateLimit = deps.checkRateLimit;
    this.findAllUserIds = deps.findAllUserIds;
  }

  async getNotifications(userId: string, limit?: number, offset?: number): Promise<Notification[]> {
    return this.repo.findByUserId(userId, limit, offset);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.findUnreadCount(userId);
  }

  async create(input: NotificationCreateInput): Promise<Notification | null> {
    const rateKey = `notify:${input.user_id}`;
    if (!(await this.checkRateLimit(rateKey, 100, 3600_000))) {
      throw new Error('تم تجاوز الحد الأقصى للإشعارات في الساعة');
    }
    return this.repo.create(input);
  }

  async broadcast(input: NotificationBroadcastInput): Promise<number> {
    if (!this.findAllUserIds) return 0;
    const userIds = await this.findAllUserIds();
    return this.repo.broadcast(input, userIds);
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    return this.repo.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    return this.repo.markAllAsRead(userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    return this.repo.delete(id, userId);
  }
}
