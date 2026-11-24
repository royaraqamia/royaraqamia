import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_DESTINATIONS,
  NotificationTypeSchema,
  type NotificationType,
} from '@/shared/contracts/notifications';
import { toPushUrl } from '@/shared/contracts/push';
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

  it('encodes a code that reached the database through a form', () => {
    expect(
      notificationTarget(notification('certificate_issued', { certificateCode: 'A/B C' }))
    ).toBe('/verify/A%2FB%20C');
  });

  it('falls back to the declared surface when the identifier is missing or blank', () => {
    expect(notificationTarget(notification('certificate_issued'))).toBe('/verify');
    expect(notificationTarget(notification('chat_request', { conversationId: '   ' }))).toBe(
      '/notifications?tab=chats'
    );
    expect(notificationTarget(notification('chat_request', { conversationId: 42 }))).toBe(
      '/notifications?tab=chats'
    );
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
    ['subscription_request', '/admin/plans/requests'],
  ] as const)('sends %s to the surface it is about', (type, expected) => {
    expect(notificationTarget(notification(type))).toBe(expected);
  });

  it('leaves an announcement where it is, because it has nowhere to go', () => {
    expect(notificationTarget(notification('system_announcement'))).toBeNull();
  });

  it('opens the follower profile from the bell as it does from the banner', () => {
    expect(notificationTarget(notification('new_follower', { username: 'rim' }))).toBe('/u/rim');
    expect(notificationTarget(notification('new_follower'))).toBe('/notifications?tab=alerts');
  });

  it('opens a published post from the bell as it does from the push', () => {
    expect(notificationTarget(notification('post_published', { slug: 'new-post' }))).toBe(
      '/community/new-post'
    );
    expect(notificationTarget(notification('post_published', { slug: 'a/b' }))).toBe(
      '/community/a%2Fb'
    );
    expect(notificationTarget(notification('post_published'))).toBe('/community');
  });

  it('opens the thread of a commented post, not just the post', () => {
    expect(
      notificationTarget(notification('post_comment', { post_slug: 'new-post', comment_id: 'c1' }))
    ).toBe('/community/new-post#comments');
    expect(notificationTarget(notification('post_comment', { post_slug: 'a/b' }))).toBe(
      '/community/a%2Fb#comments'
    );
    expect(notificationTarget(notification('post_comment'))).toBe('/community');
  });

  it('survives a null metadata column', () => {
    const row = {
      type: 'certificate_issued' as const,
      metadata: null as unknown as Record<string, unknown>,
    };

    expect(notificationTarget(row)).toBe('/verify');
  });

  it('answers the same path as the push for every type but the documented push-only fallback', () => {
    for (const type of NotificationTypeSchema.options) {
      if (type === 'system_announcement') continue;
      const { metadataKey } = NOTIFICATION_DESTINATIONS[type];
      const metadata = metadataKey ? { [metadataKey]: 'sample' } : {};
      expect(notificationTarget(notification(type, metadata)), type).toBe(
        toPushUrl(type, metadata)
      );
    }
  });
});
