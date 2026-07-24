import type { Notification, NotificationCreateInput } from './entities';

export interface INotificationRepository {
  findByUserId(userId: string, limit?: number, offset?: number): Promise<Notification[]>;
  findUnreadCount(userId: string): Promise<number>;
  create(input: NotificationCreateInput): Promise<Notification>;
  markAsRead(id: string, userId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
}
