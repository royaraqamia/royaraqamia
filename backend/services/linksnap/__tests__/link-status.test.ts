import { describe, it, expect } from 'vitest';
import { getLinkStatus } from '@/backend/services/linksnap/link-status';

describe('getLinkStatus', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');
  const past = new Date('2026-08-01T00:00:00.000Z');
  const future = new Date('2026-12-31T00:00:00.000Z');

  it('returns active for an unexpired, unblocked link', () => {
    expect(getLinkStatus(false, future, now)).toBe('active');
  });

  it('returns active when no expiry is set', () => {
    expect(getLinkStatus(false, null, now)).toBe('active');
  });

  it('returns expired when the expiry is in the past', () => {
    expect(getLinkStatus(false, past, now)).toBe('expired');
  });

  it('keeps an exact-now expiry active (boundary is not strictly past)', () => {
    expect(getLinkStatus(false, new Date('2026-08-07T12:00:00.000Z'), now)).toBe('active');
  });

  it('returns blocked regardless of expiry', () => {
    expect(getLinkStatus(true, past, now)).toBe('blocked');
    expect(getLinkStatus(true, future, now)).toBe('blocked');
  });
});
