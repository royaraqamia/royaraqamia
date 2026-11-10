import { describe, expect, it } from 'vitest';

import { dayKey, formatDaySeparator, isNewDay } from '@/frontend/ui/chats/thread-days';

/**
 * The grouping and the label read one calendar (#1111). The pair below shares a
 * UTC date while Damascus has already turned over — the case that used to draw
 * no separator between two different days — and the pair after it shares a local
 * day across two UTC dates, the mirror case.
 */
const DAMASCUS = 'Asia/Damascus';

const lateOn7 = { createdAt: '2026-11-07T20:00:00.000Z' }; // 23:00, 7 November
const pastMidnight8 = { createdAt: '2026-11-07T22:00:00.000Z' }; // 01:00, 8 November
const morningOf8 = { createdAt: '2026-11-08T01:00:00.000Z' }; // 04:00, 8 November

describe('chat thread day separators', () => {
  it('draws a separator when the local day changes inside one UTC day', () => {
    expect(dayKey(lateOn7.createdAt, DAMASCUS)).toBe('2026-11-07');
    expect(dayKey(pastMidnight8.createdAt, DAMASCUS)).toBe('2026-11-08');

    expect(isNewDay(lateOn7, pastMidnight8, DAMASCUS)).toBe(true);
    expect(formatDaySeparator(lateOn7.createdAt, DAMASCUS)).toBe('السبت، 7 نوفمبر');
    expect(formatDaySeparator(pastMidnight8.createdAt, DAMASCUS)).toBe('الأحد، 8 نوفمبر');
  });

  it('keeps one separator when the UTC day changes but the local day does not', () => {
    expect(isNewDay(pastMidnight8, morningOf8, DAMASCUS)).toBe(false);
    expect(dayKey(pastMidnight8.createdAt, DAMASCUS)).toBe(dayKey(morningOf8.createdAt, DAMASCUS));
    expect(formatDaySeparator(morningOf8.createdAt, DAMASCUS)).toBe('الأحد، 8 نوفمبر');
  });

  it('decides the separator from the same calendar the label names', () => {
    const pairs: Array<[typeof lateOn7, typeof lateOn7]> = [
      [lateOn7, pastMidnight8],
      [pastMidnight8, morningOf8],
      [lateOn7, morningOf8],
    ];
    for (const [previous, message] of pairs) {
      const labelsDiffer =
        formatDaySeparator(previous.createdAt, DAMASCUS) !==
        formatDaySeparator(message.createdAt, DAMASCUS);
      expect(isNewDay(previous, message, DAMASCUS)).toBe(labelsDiffer);
    }
  });

  it('starts a day on the first message and stops at unchanged days', () => {
    expect(isNewDay(undefined, lateOn7, DAMASCUS)).toBe(true);
    expect(isNewDay(morningOf8, morningOf8, DAMASCUS)).toBe(false);
  });
});
