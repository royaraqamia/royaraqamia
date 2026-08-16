import { describe, it, expect } from 'vitest';
import {
  PushSubscriptionSchema,
  toPushUrl,
  PUSH_URL_BY_TYPE,
  type PushSubscriptionInput,
} from '@/shared/contracts/push';

const validSubscription: PushSubscriptionInput = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: {
    p256dh: 'BElN0x3mW0vZCsmkNn1jO6W7dY6PqG8yL4rT9uX1fQ=',
    auth: 'aBcDeFgHiJkLmNoP',
  },
};

describe('PushSubscriptionSchema', () => {
  it('accepts a valid PushSubscription.toJSON() shape', () => {
    const result = PushSubscriptionSchema.safeParse(validSubscription);
    expect(result.success).toBe(true);
  });

  it('accepts an expirationTime number', () => {
    const result = PushSubscriptionSchema.safeParse({
      ...validSubscription,
      expirationTime: 1735689600,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a missing expirationTime (older browsers omit it)', () => {
    const { expirationTime: _dropped, ...rest } = validSubscription;
    expect(PushSubscriptionSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects an invalid endpoint URL', () => {
    const result = PushSubscriptionSchema.safeParse({
      ...validSubscription,
      endpoint: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing keys', () => {
    const { keys: _dropped, ...rest } = validSubscription;
    expect(PushSubscriptionSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty p256dh/auth values', () => {
    expect(
      PushSubscriptionSchema.safeParse({
        ...validSubscription,
        keys: { p256dh: '', auth: 'x' },
      }).success
    ).toBe(false);
    expect(
      PushSubscriptionSchema.safeParse({
        ...validSubscription,
        keys: { p256dh: 'x', auth: '' },
      }).success
    ).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(PushSubscriptionSchema.safeParse(null).success).toBe(false);
    expect(PushSubscriptionSchema.safeParse({}).success).toBe(false);
    expect(PushSubscriptionSchema.safeParse('garbage').success).toBe(false);
  });
});

describe('toPushUrl', () => {
  it('maps every type to its base route', () => {
    expect(PUSH_URL_BY_TYPE.certificate_issued).toBe('/verify');
    expect(PUSH_URL_BY_TYPE.post_published).toBe('/blogpress');
    expect(PUSH_URL_BY_TYPE.habit_reminder).toBe('/habitflow');
    expect(PUSH_URL_BY_TYPE.expense_alert).toBe('/spendtrack');
    expect(PUSH_URL_BY_TYPE.link_clicked).toBe('/linksnap');
    expect(PUSH_URL_BY_TYPE.system_announcement).toBe('/');
  });

  it('returns the base route when no metadata is provided', () => {
    expect(toPushUrl('habit_reminder')).toBe('/habitflow');
    expect(toPushUrl('system_announcement')).toBe('/');
    expect(toPushUrl('expense_alert', { month: '2026-08' })).toBe('/spendtrack');
  });

  it('appends the certificate code for certificate_issued', () => {
    expect(toPushUrl('certificate_issued', { certificateCode: 'COMP-2026-ABC123' })).toBe(
      '/verify/COMP-2026-ABC123'
    );
  });

  it('falls back to the base route when the certificate code is missing', () => {
    expect(toPushUrl('certificate_issued', {})).toBe('/verify');
  });

  it('resolves post_published to the public blog post when a slug is present', () => {
    expect(toPushUrl('post_published', { slug: 'my-post' })).toBe('/blog/my-post');
  });

  it('URL-encodes metadata segments', () => {
    expect(toPushUrl('certificate_issued', { certificateCode: 'أ ب' })).toBe(
      '/verify/%D8%A3%20%D8%A8'
    );
  });
});
