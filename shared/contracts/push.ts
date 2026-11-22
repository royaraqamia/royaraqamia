import { z } from 'zod';
import {
  NOTIFICATION_DESTINATIONS,
  notificationDestinationPath,
  type NotificationType,
} from '@/shared/contracts/notifications';

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

/**
 * The DB producer posts the ids of the notification rows it just inserted, so
 * the push reads its title and body from the same row the bell shows.
 */
export const PushWebhookSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1).max(10000),
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

/**
 * The push banner's landing. The destination itself, including the metadata
 * refinement and the fallback when an identifier is missing, is declared once
 * in `shared/contracts/notifications`. The only push-specific rule is that a
 * type whose row only marks itself read still needs somewhere to land.
 */
export function toPushUrl(type: NotificationType, metadata?: Record<string, unknown>): string {
  return (
    notificationDestinationPath(type, metadata) ??
    NOTIFICATION_DESTINATIONS[type].fallbackPath ??
    '/'
  );
}
