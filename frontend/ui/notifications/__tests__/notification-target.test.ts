import { describe, it, expect } from 'vitest';
import type { NotificationType } from '@/shared/contracts/notifications';
import { notificationTarget } from '../notification-target';

function notification(type: NotificationType, metadata: Record<string, unknown> = {}) {
  return { type, metadata };
}

describe('notificationTarget', () => {
  it('sends an issued certificate to its public verification page', () => {
    expect(
      notificationTarget(
        notification('certificate_issued', { certificateCode: 'COMP-2026-ABCDEFGH' })
      )
    ).toBe('/verify/COMP-2026-ABCDEFGH');
  });

  it('encodes a code or slug that reached the database through a form', () => {
    expect(
      notificationTarget(notification('certificate_issued', { certificateCode: 'A/B C' }))
    ).toBe('/verify/A%2FB%20C');
    expect(notificationTarget(notification('post_published', { slug: 'مقال جديد' }))).toBe(
      `/community/${encodeURIComponent('مقال جديد')}`
    );
  });

  it('answers null when the identifier the route needs is missing or blank', () => {
    expect(notificationTarget(notification('certificate_issued'))).toBeNull();
    expect(notificationTarget(notification('post_published', { slug: '   ' }))).toBeNull();
    expect(notificationTarget(notification('post_published', { slug: 42 }))).toBeNull();
  });

  it.each([
    ['habit_reminder', '/habitflow'],
    ['recovery_nudge', '/habitflow'],
    ['expense_alert', '/spendtrack'],
    ['link_clicked', '/linksnap'],
    ['training_application', '/admin/training/applications'],
    ['consultation_booking', '/admin/consultations/bookings'],
    ['project_request', '/admin/clients/project-requests'],
    ['retainer_request', '/admin/clients/retainers'],
  ] as const)('sends %s to the surface it is about', (type, expected) => {
    expect(notificationTarget(notification(type))).toBe(expected);
  });

  it('leaves an announcement where it is, because it has nowhere to go', () => {
    expect(notificationTarget(notification('system_announcement'))).toBeNull();
  });

  it('survives a null metadata column', () => {
    const row = {
      type: 'post_published' as const,
      metadata: null as unknown as Record<string, unknown>,
    };

    expect(notificationTarget(row)).toBeNull();
  });
});
