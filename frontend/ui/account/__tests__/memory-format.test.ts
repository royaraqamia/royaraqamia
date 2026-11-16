import { describe, expect, it } from 'vitest';

import { formatMemoryDate } from '@/backend/shared/domain/agent-memory';
import { memoryDate } from '@/frontend/ui/account/memory-format';

/**
 * A fact's date reads one calendar wherever it is drawn (#1545). 22:30 UTC is
 * already 01:30 on the next day in Damascus, and the page used to follow the
 * browser's clock while the recall citation pinned UTC — so a member in Syria
 * read two different dates for one fact. Both formatters now name the Damascus
 * day, and this asserts that they agree rather than each matching a literal.
 */
const BEFORE_MIDNIGHT = '2026-11-15T20:59:00.000Z'; // 23:59, 15 November in Damascus
const AT_MIDNIGHT = '2026-11-15T21:00:00.000Z'; // 00:00, 16 November in Damascus
const LATE_ON_15 = '2026-11-15T22:30:00.000Z'; // 01:30, 16 November in Damascus

describe('memoryDate', () => {
  it('names the Damascus day, not the UTC one', () => {
    expect(memoryDate(LATE_ON_15)).toBe('16 نوفمبر');
  });

  it('flips the day at Damascus midnight', () => {
    expect(memoryDate(BEFORE_MIDNIGHT)).toBe('15 نوفمبر');
    expect(memoryDate(AT_MIDNIGHT)).toBe('16 نوفمبر');
  });

  it('reads the same date as the recall citation', () => {
    for (const value of [BEFORE_MIDNIGHT, AT_MIDNIGHT, LATE_ON_15]) {
      expect(memoryDate(value)).toBe(formatMemoryDate(value));
    }
  });

  it('renders nothing for a value that is not a date', () => {
    expect(memoryDate('not-a-date')).toBe('');
  });
});
