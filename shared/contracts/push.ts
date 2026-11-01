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

/**
 * A native device token: the FCM registration id the Capacitor shell receives
 * from its push plugin. Unlike a Web Push subscription it carries no keys — the
 * transport authenticates with the Firebase service account, not the browser.
 */
export const PushDeviceTokenSchema = z.object({
  token: z.string().trim().min(1).max(4096),
  platform: z.enum(['android', 'ios']).default('android'),
});

export const PushDeviceUnregisterSchema = z.object({
  token: z.string().trim().min(1).max(4096),
});

/**
 * A sync wake (ADR-0059, ADR-0060): "this account just moved — tell my other
 * devices". The one field is the caller's own device token, so the device that
 * wrote is not woken by its own commit; a browser tab has none and leaves it out.
 *
 * Nothing else travels: a hint may only cause a pull, never carry state.
 */
export const PushWakeSchema = z.object({
  token: z.string().trim().min(1).max(4096).optional(),
});

export const PushWebhookSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(10000),
});

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>;
export type PushWebhookInput = z.infer<typeof PushWebhookSchema>;
export type PushDeviceTokenInput = z.infer<typeof PushDeviceTokenSchema>;
export type PushDeviceUnregisterInput = z.infer<typeof PushDeviceUnregisterSchema>;
export type PushWakeInput = z.infer<typeof PushWakeSchema>;

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
  training_application: '/admin/training/applications',
  consultation_booking: '/admin/consultations/bookings',
  project_request: '/admin/clients/project-requests',
  retainer_request: '/admin/clients/retainers',
  chat_request: '/notifications?tab=chats',
};

export function toPushUrl(type: NotificationType, metadata?: Record<string, unknown>): string {
  const base = PUSH_URL_BY_TYPE[type];
  if (type === 'chat_request') {
    // The request is answered in the thread, so the push opens it directly.
    const conversationId = metadata?.conversationId;
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      return `/chats/${encodeURIComponent(conversationId)}`;
    }
  }
  if (type === 'certificate_issued') {
    const code = metadata?.certificateCode;
    if (typeof code === 'string' && code.length > 0) {
      return `${base}/${encodeURIComponent(code)}`;
    }
  }
  if (type === 'post_published') {
    const slug = metadata?.slug;
    if (typeof slug === 'string' && slug.length > 0) {
      return `/community/${encodeURIComponent(slug)}`;
    }
  }
  return base;
}
