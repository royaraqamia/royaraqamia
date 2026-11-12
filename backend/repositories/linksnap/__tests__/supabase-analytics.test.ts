import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAnalyticsRepository } from '@/backend/repositories/linksnap/supabase-analytics';

interface ClickRow {
  id: string;
  link_code: string;
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
  ip_country: string | null;
}

interface Result {
  data: unknown;
  error: unknown;
}

/** The chain `fetchEvents` builds, resolved as the rows the fake database holds. */
class EventsBuilder {
  constructor(private readonly result: Result) {}

  select() {
    return this;
  }
  eq() {
    return this;
  }
  gte() {
    return this;
  }
  lte() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function repoWith(rows: ClickRow[]) {
  const client = {
    from: () => new EventsBuilder({ data: rows, error: null }),
  } as unknown as SupabaseClient;
  return new SupabaseAnalyticsRepository(client);
}

function click(clickedAt: string, id = 'e1'): ClickRow {
  return {
    id,
    link_code: 'abc',
    clicked_at: clickedAt,
    referrer: null,
    user_agent: null,
    ip_country: null,
  };
}

/**
 * The chart's days are the app's days (#1085).
 *
 * A day flips at Damascus midnight (ADR-0093), so a click made at 01:00 in
 * Damascus belongs to that Damascus day even though a UTC clock still reads the
 * previous evening. The aggregation used to build its buckets from local date
 * parts and key them through `toISOString()`, which put the same click on the
 * day before — the production server runs in UTC, so that was every morning
 * click. These cases pin the boundary from both sides.
 */
describe('SupabaseAnalyticsRepository — clicks by Damascus day', () => {
  it('counts a 01:00 Damascus click on its Damascus day, not the UTC day before', async () => {
    const repo = repoWith([click('2026-11-06T01:00:00+03:00')]);

    const summary = await repo.getSummaryForLink('abc', {
      // Damascus 2026-11-04 03:00 through 2026-11-06 23:59:59.
      from: new Date('2026-11-04T00:00:00Z'),
      to: new Date('2026-11-06T20:59:59Z'),
    });

    expect(summary.clicksByDate).toEqual([
      { date: '2026-11-04', clicks: 0 },
      { date: '2026-11-05', clicks: 0 },
      { date: '2026-11-06', clicks: 1 },
    ]);
  });

  it('the same instant written in UTC lands in the same bucket', async () => {
    // 2026-11-05T22:00Z is 01:00 on 6 November in Damascus (UTC+3, no DST).
    const repo = repoWith([click('2026-11-05T22:00:00Z')]);

    const summary = await repo.getSummaryForLink('abc', {
      from: new Date('2026-11-04T00:00:00Z'),
      to: new Date('2026-11-06T20:59:59Z'),
    });

    expect(summary.clicksByDate.find((day) => day.date === '2026-11-06')?.clicks).toBe(1);
    expect(summary.clicksByDate.find((day) => day.date === '2026-11-05')?.clicks).toBe(0);
  });

  it('keeps the last evening of the range on its own Damascus day', async () => {
    // 22:30 in Damascus on 6 November is what the previous UTC-day key lost.
    const repo = repoWith([click('2026-11-06T22:30:00+03:00')]);

    const summary = await repo.getSummaryForLink('abc', {
      from: new Date('2026-11-04T00:00:00Z'),
      to: new Date('2026-11-06T20:59:59Z'),
    });

    expect(summary.clicksByDate.at(-1)).toEqual({ date: '2026-11-06', clicks: 1 });
  });

  it('still caps the skeleton at 366 buckets and leaves the totals alone', async () => {
    const repo = repoWith([click('2026-11-06T01:00:00+03:00')]);

    const summary = await repo.getSummaryForLink('abc', {
      from: new Date('2024-01-01T00:00:00Z'),
      to: new Date('2026-11-06T20:59:59Z'),
    });

    expect(summary.clicksByDate).toHaveLength(367);
    expect(summary.totalClicks).toBe(1);
    expect(summary.topReferrers).toEqual([{ name: 'Direct / Email / QR', count: 1 }]);
  });
});
