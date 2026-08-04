import type { Notification, NotificationCreateInput } from '@/shared/contracts/notifications';

export interface NotificationRepository {
  findByUserId(userId: string, limit?: number, offset?: number): Promise<Notification[]>;
  findUnreadCount(userId: string): Promise<number>;
  create(input: NotificationCreateInput): Promise<Notification | null>;
  markAsRead(id: string, userId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
}
