import { describe, it, expect } from 'vitest';

import { damascusDateKey } from '@/shared/time';

describe('damascusDateKey', () => {
  it('reads the Damascus calendar day, not the UTC one', () => {
    // 00:30 in Damascus on 31 October, still 30 October in UTC.
    expect(damascusDateKey(new Date('2026-10-30T21:30:00Z'))).toBe('2026-10-31');
  });

  it('keeps one key across a UTC midnight inside a single Damascus day', () => {
    expect(damascusDateKey(new Date('2026-10-30T21:30:00Z'))).toBe(
      damascusDateKey(new Date('2026-10-31T02:00:00Z'))
    );
  });

  it('flips at Damascus midnight', () => {
    expect(damascusDateKey(new Date('2026-10-30T20:59:00Z'))).toBe('2026-10-30');
    expect(damascusDateKey(new Date('2026-10-30T21:01:00Z'))).toBe('2026-10-31');
  });
});
