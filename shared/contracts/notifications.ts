import { z } from 'zod';
import { UserIdsSchema } from '@/shared/contracts/users';

export type NotificationType =
  | 'certificate_issued'
  | 'post_published'
  | 'habit_reminder'
  | 'recovery_nudge'
  | 'expense_alert'
  | 'link_clicked'
  | 'system_announcement'
  | 'training_application'
  | 'consultation_booking'
  | 'project_request'
  | 'retainer_request'
  | 'chat_request';

/**
 * The unread count behind the shell's notification control (#659).
 *
 * `/api/notifications/unread-count` answers `{ count }` with `Cache-Control: no-store`,
 * and a guest is answered zero rather than 401 - the bell is chrome, so the answer
 * it draws has to exist for everyone. Both clients read this one shape: the
 * aria-label and the badge say the same number or neither is right.
 */
export const UnreadNotificationCountSchema = z.object({
  count: z.coerce.number().int().nonnegative(),
});

export type UnreadNotificationCount = z.infer<typeof UnreadNotificationCountSchema>;

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NotificationCreateInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationWithMeta extends Notification {
  timeAgo: string;
}

export const AnnouncementSendSchema = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(120, 'العنوان طويل جداً'),
  body: z.string().trim().max(1000, 'نص الإعلان طويل جداً').optional(),
  userIds: UserIdsSchema.optional(),
});

export type AnnouncementSendInput = z.infer<typeof AnnouncementSendSchema>;
