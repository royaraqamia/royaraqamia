import type { Notification, NotificationType } from '@/shared/contracts/notifications';

/**
 * Where a notification row leads when it is opened.
 *
 * The rows carry no URL of their own: `metadata` holds the identifier the
 * producer had at hand (`slug`, `certificateCode`, …), so the mapping lives
 * here, in one table, rather than being re-derived at each call site. A type
 * whose producer never stored an identifier still has a stable destination
 * (the surface the notification is about), and a type with neither answers
 * `null`, which the page renders as a row that only marks itself read.
 *
 * `/verify/[code]` and `/community/[slug]` take the identifier in the path, so
 * the value is encoded: a slug or code that reached the database through a
 * form is user data.
 */

/** Destinations that do not depend on a row's metadata. */
const FIXED_TARGETS: Partial<Record<NotificationType, string>> = {
  habit_reminder: '/habitflow',
  recovery_nudge: '/habitflow',
  expense_alert: '/spendtrack',
  link_clicked: '/linksnap',
  training_application: '/admin/training/applications',
  consultation_booking: '/admin/consultations/bookings',
  project_request: '/admin/clients/project-requests',
  retainer_request: '/admin/clients/retainers',
};

/** A metadata value as a path segment, or `null` when there is nothing usable. */
function segment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? encodeURIComponent(trimmed) : null;
}

export function notificationTarget(
  notification: Pick<Notification, 'type' | 'metadata'>
): string | null {
  // `metadata` is a JSON column, so a row written before the column existed —
  // or by a producer that had nothing to store — can present `null`.
  const metadata = notification.metadata ?? {};

  switch (notification.type) {
    case 'certificate_issued': {
      const code = segment(metadata.certificateCode);
      return code ? `/verify/${code}` : null;
    }
    case 'post_published': {
      const slug = segment(metadata.slug);
      return slug ? `/community/${slug}` : null;
    }
    default:
      return FIXED_TARGETS[notification.type] ?? null;
  }
}
