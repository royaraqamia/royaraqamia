import { z } from 'zod';
import { UserIdsSchema } from '@/shared/contracts/users';

export const NotificationTypeSchema = z.enum([
  'certificate_issued',
  'habit_reminder',
  'recovery_nudge',
  'expense_alert',
  'link_clicked',
  'system_announcement',
  'training_application',
  'consultation_booking',
  'project_request',
  'retainer_request',
  'subscription_request',
  'chat_request',
  'new_follower',
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/**
 * Where a notification leads (#1676).
 *
 * One entry per type, read by the push builder, the web list and the app's
 * generated `targetOf`, so a destination is changed in one place. `path` is a
 * template: `{key}` is filled from the row's metadata and encoded as one path
 * segment. `path: null` is a row that only marks itself read; `fallbackPath` is
 * where a banner lands in that case (a push cannot be a no-op) and where a
 * templated path lands when the identifier is missing.
 */
export interface NotificationDestination {
  path: string | null;
  metadataKey?: string;
  fallbackPath?: string;
}

/**
 * The one destination table. Total on purpose: adding a type to
 * `NotificationTypeSchema` without a row here is a compile error, not a row
 * that silently goes nowhere.
 */
export const NOTIFICATION_DESTINATIONS: Record<NotificationType, NotificationDestination> = {
  certificate_issued: {
    path: '/verify/{certificateCode}',
    metadataKey: 'certificateCode',
    fallbackPath: '/verify',
  },
  habit_reminder: { path: '/habitflow' },
  recovery_nudge: { path: '/habitflow' },
  expense_alert: { path: '/spendtrack' },
  link_clicked: { path: '/linksnap' },
  system_announcement: { path: null, fallbackPath: '/' },
  training_application: { path: '/admin/training/applications' },
  consultation_booking: { path: '/admin/consultations/bookings' },
  project_request: { path: '/admin/clients/project-requests' },
  retainer_request: { path: '/admin/clients/retainers' },
  subscription_request: { path: '/admin/plans/requests' },
  chat_request: {
    path: '/chats/{conversationId}',
    metadataKey: 'conversationId',
    fallbackPath: '/notifications?tab=chats',
  },
  new_follower: {
    path: '/u/{username}',
    metadataKey: 'username',
    fallbackPath: '/notifications?tab=alerts',
  },
};

/** The path one row leads to, or `null` when the row only marks itself read. */
export function notificationDestinationPath(
  type: NotificationType,
  metadata?: Record<string, unknown> | null
): string | null {
  const destination = NOTIFICATION_DESTINATIONS[type];
  if (destination.path === null) return null;
  if (!destination.metadataKey) return destination.path;
  const value = metadata?.[destination.metadataKey];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return destination.fallbackPath ?? null;
  }
  return destination.path.replace(`{${destination.metadataKey}}`, encodeURIComponent(value.trim()));
}

/**
 * The metadata a row's destination is derived from (`notificationTarget`).
 *
 * Only the identifiers one target needs are typed: a notification's metadata is
 * a JSON column producers fill differently per type, and the app decodes this
 * shape to answer "where does the row lead" rather than to redraw the payload.
 * Unknown keys are ignored by both decoders.
 */
export const NotificationMetadataSchema = z.object({
  certificateCode: z.string().optional(),
  conversationId: z.string().optional(),
  username: z.string().optional(),
});

export const NotificationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  metadata: NotificationMetadataSchema,
  is_read: z.boolean(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

/** The body `/api/notifications` answers, and the app's notification list reads. */
export const NotificationsResponseSchema = z.object({
  notifications: z.array(NotificationSchema),
});

export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

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
