import { z } from 'zod';
import { UserIdsSchema } from '@/shared/contracts/users';

export type NotificationType =
  | 'certificate_issued'
  | 'post_published'
  | 'habit_reminder'
  | 'recovery_nudge'
  | 'expense_alert'
  | 'link_clicked'
  | 'system_announcement';

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
