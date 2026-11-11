import { describe, it, expect, afterEach } from 'vitest';
import { END_OF_DAY, expiryInstant } from '@/frontend/shared/linksnap/expiry';

const ORIGINAL_TZ = process.env.TZ;

function setTimezone(timezone: string): void {
  process.env.TZ = timezone;
}

function restoreTimezone(): void {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
}

/** What the single-row editor built for the same date before the extraction. */
function singleRowInstant(date: string, time = END_OF_DAY): string {
  return new Date(`${date}T${time}`).toISOString();
}

describe('expiryInstant', () => {
  afterEach(restoreTimezone);

  it('expires at the end of the chosen day, not at its start in UTC', () => {
    setTimezone('Asia/Damascus'); // UTC+3

    // The bulk bar used to send `new Date('2026-11-07')`: 03:00 in Damascus,
    // already past, so the links were expired the moment they were set.
    expect(expiryInstant('2026-11-07')).toBe('2026-11-07T20:59:59.000Z');
    expect(new Date('2026-11-07').toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('agrees with the single-row editor on the same date', () => {
    setTimezone('Asia/Damascus');

    expect(expiryInstant('2026-11-07')).toBe(singleRowInstant('2026-11-07'));
    expect(expiryInstant('2026-11-07', '09:30')).toBe(singleRowInstant('2026-11-07', '09:30'));
  });

  it('reads the day on the device clock west of UTC too', () => {
    setTimezone('America/New_York'); // UTC-5 in November, after the DST change

    // 23:59:59 in New York is already 08 November in UTC.
    expect(expiryInstant('2026-11-07')).toBe('2026-11-08T04:59:59.000Z');
  });

  it('treats a time the form never filled in as the end of the day', () => {
    setTimezone('Asia/Damascus');

    expect(expiryInstant('2026-11-07', '')).toBe(expiryInstant('2026-11-07'));
    expect(expiryInstant('2026-11-07', '   ')).toBe(expiryInstant('2026-11-07'));
  });
});
