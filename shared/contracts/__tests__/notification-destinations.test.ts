import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_DESTINATIONS,
  NotificationTypeSchema,
  notificationDestinationPath,
} from '../notifications';

describe('NOTIFICATION_DESTINATIONS', () => {
  it('declares an explicit destination for every notification type', () => {
    for (const type of NotificationTypeSchema.options) {
      expect(Object.prototype.hasOwnProperty.call(NOTIFICATION_DESTINATIONS, type)).toBe(true);
      expect(NOTIFICATION_DESTINATIONS[type]).toHaveProperty('path');
    }
  });

  it('refines a metadata key into one encoded path segment', () => {
    expect(notificationDestinationPath('new_follower', { username: 'أ ب' })).toBe(
      '/u/%D8%A3%20%D8%A8'
    );
    expect(notificationDestinationPath('certificate_issued', { certificateCode: 'A/B' })).toBe(
      '/verify/A%2FB'
    );
  });

  it('falls back to the declared base when the identifier is missing or blank', () => {
    expect(notificationDestinationPath('new_follower', {})).toBe('/notifications?tab=alerts');
    expect(notificationDestinationPath('new_follower', { username: '   ' })).toBe(
      '/notifications?tab=alerts'
    );
    expect(notificationDestinationPath('new_follower', { username: 42 })).toBe(
      '/notifications?tab=alerts'
    );
  });

  it('answers null only for the type declared as a read-only row', () => {
    expect(notificationDestinationPath('system_announcement')).toBeNull();
    expect(NOTIFICATION_DESTINATIONS.system_announcement).toEqual({
      path: null,
      fallbackPath: '/',
    });
  });
});
