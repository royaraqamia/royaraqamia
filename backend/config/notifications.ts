import {
  NotificationService,
  type NotificationServiceDeps,
} from '@/backend/services/notifications/notification-service';
import type { INotificationRepository } from '@/backend/repositories/notifications/notifications-repository';

export function createNotificationService(
  repo: INotificationRepository,
  deps: NotificationServiceDeps = {}
): NotificationService {
  return new NotificationService(repo, deps);
}
