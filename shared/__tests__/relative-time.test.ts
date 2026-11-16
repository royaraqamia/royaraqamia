import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '../relative-time';

/**
 * One clock for the digest and the community card. The Arabic is the platform's
 * (`Intl.RelativeTimeFormat`), so what is asserted here is the ladder and the
 * two silences, not the exact wording of a phrase this file does not own.
 */
describe('formatRelativeTime', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('says «الآن» for the last minute rather than «قبل 0 دقيقة»', () => {
    expect(formatRelativeTime(ago(10_000), now)).toBe('الآن');
  });

  it('counts minutes, then hours, then days', () => {
    expect(formatRelativeTime(ago(3 * 60_000), now)).toContain('3');
    expect(formatRelativeTime(ago(5 * 3_600_000), now)).toContain('5');
    expect(formatRelativeTime(ago(4 * 86_400_000), now)).toContain('4');
  });

  it('keeps a two-year-old post readable instead of counting 730 days', () => {
    const formatter = new Intl.RelativeTimeFormat('ar-SY-u-nu-latn', { numeric: 'auto' });
    const twoYears = formatRelativeTime(ago(730 * 86_400_000), now);

    expect(twoYears).toBe(formatter.format(-2, 'year'));
    expect(twoYears).not.toBe(formatter.format(-730, 'day'));
  });

  it('renders nothing for the two timestamps it cannot read', () => {
    expect(formatRelativeTime(null, now)).toBeNull();
    expect(formatRelativeTime('not a date', now)).toBeNull();
  });
});
