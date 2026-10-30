import { describe, it, expect } from 'vitest';

import { timeAgoParts } from '@/frontend/shared/format';

/**
 * The thresholds of "time ago", held to the app's (ADR-0104).
 *
 * The Kotlin half is `TimeAgoTest`; the two suites assert the same boundaries, so
 * a change to one that the other does not follow turns exactly one of them red.
 * The words are deliberately not here — each surface renders its own copy.
 */
describe('timeAgoParts', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');
  const at = (secondsAgo: number) =>
    timeAgoParts(new Date(now - secondsAgo * 1000).toISOString(), now);

  it('answers "now" under a minute', () => {
    expect(at(0)).toEqual({ unit: 'now' });
    expect(at(59)).toEqual({ unit: 'now' });
  });

  it('counts minutes, then hours, then days, then weeks', () => {
    expect(at(60)).toEqual({ unit: 'minutes', count: 1 });
    expect(at(59 * 60)).toEqual({ unit: 'minutes', count: 59 });
    expect(at(60 * 60)).toEqual({ unit: 'hours', count: 1 });
    expect(at(23 * 3600)).toEqual({ unit: 'hours', count: 23 });
    expect(at(24 * 3600)).toEqual({ unit: 'days', count: 1 });
    expect(at(6 * 86400)).toEqual({ unit: 'days', count: 6 });
    expect(at(7 * 86400)).toEqual({ unit: 'weeks', count: 1 });
    expect(at(27 * 86400)).toEqual({ unit: 'weeks', count: 3 });
  });

  it('gives up on a month, and on a string that is not an instant', () => {
    expect(at(28 * 86400)).toEqual({ unit: 'date' });
    expect(timeAgoParts('not a date', now)).toEqual({ unit: 'date' });
  });
});
