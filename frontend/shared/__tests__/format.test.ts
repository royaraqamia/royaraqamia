import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDateArabic, formatHijriDate, calculateTimeAgo } from '@/frontend/shared/format';

describe('formatDateArabic', () => {
  it('formats a date string without throwing', () => {
    const result = formatDateArabic('2026-08-02');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the Hijri era marker in the output', () => {
    const result = formatDateArabic('2026-08-02T00:00:00Z');
    expect(result).toContain('هـ');
  });

  it('returns the input unchanged for an invalid date string', () => {
    expect(formatDateArabic('not-a-date')).toBe('not-a-date');
  });
});

describe('formatHijriDate', () => {
  it('accepts Date, string and number inputs', () => {
    const fromDate = formatHijriDate(new Date('2026-08-02T00:00:00Z'));
    const fromString = formatHijriDate('2026-08-02T00:00:00Z');
    const fromNumber = formatHijriDate(new Date('2026-08-02T00:00:00Z').getTime());

    expect(typeof fromDate).toBe('string');
    expect(fromDate.length).toBeGreaterThan(0);
    expect(fromString).toBe(fromDate);
    expect(fromNumber).toBe(fromDate);
  });

  it('merges custom options with the default islamic calendar', () => {
    const result = formatHijriDate('2026-08-02T00:00:00Z', {
      month: 'numeric',
      day: '2-digit',
      year: 'numeric',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('calculateTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "منذ لحظات" for under a minute', () => {
    expect(calculateTimeAgo('2026-08-02T11:59:30Z')).toBe('منذ لحظات');
  });

  it('returns minutes for under an hour', () => {
    expect(calculateTimeAgo('2026-08-02T11:01:00Z')).toBe('منذ 59 دقيقة');
    expect(calculateTimeAgo('2026-08-02T11:30:00Z')).toBe('منذ 30 دقيقة');
  });

  it('returns hours at the 60-minute boundary', () => {
    expect(calculateTimeAgo('2026-08-02T11:00:00Z')).toBe('منذ 1 ساعة');
  });

  it('returns hours for under 24 hours', () => {
    expect(calculateTimeAgo('2026-08-02T10:00:00Z')).toBe('منذ 2 ساعة');
    expect(calculateTimeAgo('2026-08-01T13:00:00Z')).toBe('منذ 23 ساعة');
  });

  it('returns days for under a week', () => {
    expect(calculateTimeAgo('2026-08-01T12:00:00Z')).toBe('منذ 1 يوم');
    expect(calculateTimeAgo('2026-07-28T12:00:00Z')).toBe('منذ 5 يوم');
  });

  it('returns weeks for under 4 weeks', () => {
    expect(calculateTimeAgo('2026-07-20T12:00:00Z')).toBe('منذ 1 أسبوع');
    expect(calculateTimeAgo('2026-07-10T12:00:00Z')).toBe('منذ 3 أسبوع');
  });

  it('falls back to the Hijri date for older timestamps', () => {
    const result = calculateTimeAgo('2026-01-01T12:00:00Z');
    expect(result).not.toMatch(/^منذ /);
  });
});
