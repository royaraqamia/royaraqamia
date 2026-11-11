import { afterEach, beforeEach, describe, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatHijriDate } from '@/frontend/shared/format';
import { SPENDTRACK_TOTAL_COPY } from '../spendtrack-total-copy';
import { TotalSpendCard } from '../total-spend-card';

const ORIGINAL_TZ = process.env.TZ;

/**
 * The day a date-only value names, formatted by the site's own Hijri formatter
 * pinned to UTC — what the card must print whatever zone the reader sits in.
 */
function utcDay(day: string): string {
  return formatHijriDate(`${day}T00:00:00.000Z`, { timeZone: 'UTC' });
}

function expectRange(start: string, end: string): void {
  render(<TotalSpendCard total={1250} start={start} end={end} currency="USD" />);
  screen.getByText(`${utcDay(start)} ${SPENDTRACK_TOTAL_COPY.rangeSeparator} ${utcDay(end)}`);
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// #1159: a date-only range is a calendar day, so the sentence must not move
// when the reader's zone sits behind or ahead of UTC.
describe.each(['Asia/Damascus', 'UTC', 'America/Los_Angeles'])(
  'the total card range read in %s',
  (timezone) => {
    beforeEach(() => {
      process.env.TZ = timezone;
    });

    it('prints the current month first and last day', () => {
      expectRange('2026-11-01', '2026-11-30');
    });

    it('prints the last 7 days first and last day', () => {
      expectRange('2026-11-05', '2026-11-11');
    });

    it('prints the last 30 days first and last day', () => {
      expectRange('2026-10-13', '2026-11-11');
    });

    it('prints the all-time sentinels as their own days', () => {
      expectRange('1900-01-01', '2099-12-31');
    });
  }
);
