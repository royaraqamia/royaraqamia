export type NotificationType =
  | 'certificate_issued'
  | 'post_published'
  | 'habit_reminder'
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
