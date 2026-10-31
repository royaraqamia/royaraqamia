import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localDate, localMonth } from '@/frontend/shared/spendtrack/local-date';

const ORIGINAL_TZ = process.env.TZ;

function setTimezone(timezone: string): void {
  process.env.TZ = timezone;
}

describe('localDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it('reads the local day east of UTC, not the UTC day', () => {
    setTimezone('Asia/Damascus'); // UTC+3
    // 01:00 on 1 November in Damascus, which is still 31 October in UTC.
    vi.setSystemTime(new Date('2026-10-31T22:00:00Z'));
    expect(localDate()).toBe('2026-11-01');
    expect(localMonth()).toBe('2026-11');
  });

  it('reads the local day west of UTC, not the UTC day', () => {
    setTimezone('America/New_York'); // UTC-4
    // 22:00 on 31 October in New York, which is already 1 November in UTC.
    vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));
    expect(localDate()).toBe('2026-10-31');
    expect(localMonth()).toBe('2026-10');
  });

  it('follows the device clock across local midnight', () => {
    setTimezone('Asia/Damascus');
    vi.setSystemTime(new Date('2026-10-31T20:59:00Z')); // 23:59 local
    expect(localDate()).toBe('2026-10-31');
    vi.setSystemTime(new Date('2026-10-31T21:01:00Z')); // 00:01 local
    expect(localDate()).toBe('2026-11-01');
  });
});
