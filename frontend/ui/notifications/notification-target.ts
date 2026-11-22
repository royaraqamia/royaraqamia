import { notificationDestinationPath, type Notification } from '@/shared/contracts/notifications';

/**
 * Where a notification row leads when it is opened.
 *
 * The rows carry no URL of their own: `metadata` holds the identifier the
 * producer had at hand (`certificateCode`, `conversationId`, `username`), and
 * the destination table in `shared/contracts/notifications` is the one place
 * that says where each type leads. A type whose producer never stored an
 * identifier still has a stable destination (the surface the notification is
 * about), and a type with neither answers `null`, which the page renders as a
 * row that only marks itself read.
 *
 * `/verify/[code]`, `/chats/[id]` and `/u/[username]` take the identifier in
 * the path, so the value is encoded: it reached the database through user data.
 */

export function notificationTarget(
  notification: Pick<Notification, 'type' | 'metadata'>
): string | null {
  // `metadata` is a JSON column, so a row written before the column existed —
  // or by a producer that had nothing to store — can present `null`.
  return notificationDestinationPath(notification.type, notification.metadata ?? {});
}
