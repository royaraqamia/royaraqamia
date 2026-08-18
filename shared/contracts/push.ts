import { z } from 'zod';
import type { NotificationType } from '@/shared/contracts/notifications';

export const PushSubscriptionSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullish(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const PushUnsubscribeSchema = z.object({
  endpoint: z.url(),
});

export const PushWebhookSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(10000),
});

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>;
export type PushWebhookInput = z.infer<typeof PushWebhookSchema>;

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  type?: NotificationType;
  notificationId?: string;
}

export const PUSH_URL_BY_TYPE: Record<NotificationType, string> = {
  certificate_issued: '/verify',
  post_published: '/blogpress',
  habit_reminder: '/habitflow',
  recovery_nudge: '/habitflow',
  expense_alert: '/spendtrack',
  link_clicked: '/linksnap',
  system_announcement: '/',
};

export function toPushUrl(type: NotificationType, metadata?: Record<string, unknown>): string {
  const base = PUSH_URL_BY_TYPE[type];
  if (type === 'certificate_issued') {
    const code = metadata?.certificateCode;
    if (typeof code === 'string' && code.length > 0) {
      return `${base}/${encodeURIComponent(code)}`;
    }
  }
  if (type === 'post_published') {
    const slug = metadata?.slug;
    if (typeof slug === 'string' && slug.length > 0) {
      return `/blog/${encodeURIComponent(slug)}`;
    }
  }
  return base;
}
