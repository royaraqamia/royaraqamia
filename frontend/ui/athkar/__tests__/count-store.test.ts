import { describe, expect, it } from 'vitest';

import {
  ATHKAR_COUNTS_KEY,
  clearOne,
  completedCount,
  countFor,
  dayKey,
  emptyCounts,
  increment,
  nextMidnightDelay,
  readCounts,
  writeCounts,
  type AthkarCounts,
} from '../count-store';
import type { AthkarItem } from '@/shared/contracts/athkar';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));

  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  } as Storage;
}

function item(id: string, repeat = 3): AthkarItem {
  return { id, text: 'ذكر', repeat, source: { label: 'مصدر', ref: '1' } };
}

describe('dayKey', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 00:30 local on the 28th is still the 27th in UTC for a +03 device.
    expect(dayKey(new Date(2026, 9, 28, 0, 30))).toBe('2026-10-28');
    expect(dayKey(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });
});

describe('readCounts and writeCounts', () => {
  it('start from an empty day when the device remembers nothing', () => {
    const state = readCounts('2026-10-28', memoryStorage());

    expect(state).toEqual(emptyCounts('2026-10-28'));
  });

  it('read back what was written for the same day', () => {
    const store = memoryStorage();
    const written = increment(emptyCounts('2026-10-28'), 'morning', 'ayat-al-kursi', 1);

    writeCounts(written, store);

    expect(readCounts('2026-10-28', store)).toEqual(written);
  });

  it("do not carry yesterday's count into today", () => {
    const store = memoryStorage();
    writeCounts(increment(emptyCounts('2026-10-27'), 'morning', 'ayat-al-kursi', 1), store);

    expect(readCounts('2026-10-28', store)).toEqual(emptyCounts('2026-10-28'));
  });

  it('treat a corrupt record as no record', () => {
    const store = memoryStorage({ [ATHKAR_COUNTS_KEY]: '{"day":"2026-10-28","morning":' });

    expect(readCounts('2026-10-28', store)).toEqual(emptyCounts('2026-10-28'));
  });

  it('drop values that are not positive integers', () => {
    const store = memoryStorage({
      [ATHKAR_COUNTS_KEY]: JSON.stringify({
        day: '2026-10-28',
        morning: { good: 2, zero: 0, text: '3', negative: -1 },
        evening: { okay: 1 },
      }),
    });

    expect(readCounts('2026-10-28', store)).toEqual({
      day: '2026-10-28',
      morning: { good: 2 },
      evening: { okay: 1 },
    });
  });
});

describe('increment', () => {
  it('adds one and stops at the stated count', () => {
    let state: AthkarCounts = emptyCounts('2026-10-28');

    state = increment(state, 'evening', 'hasbiyallah', 2);
    expect(state.evening.hasbiyallah).toBe(1);

    state = increment(state, 'evening', 'hasbiyallah', 2);
    expect(state.evening.hasbiyallah).toBe(2);

    expect(increment(state, 'evening', 'hasbiyallah', 2)).toBe(state);
  });

  it('keeps the two sittings apart', () => {
    const state = increment(emptyCounts('2026-10-28'), 'morning', 'hasbiyallah', 7);

    expect(state.morning.hasbiyallah).toBe(1);
    expect(state.evening.hasbiyallah).toBeUndefined();
  });

  it('pulls a hand-edited over-count back to the target', () => {
    const state = { ...emptyCounts('2026-10-28'), morning: { hasbiyallah: 999 } };

    expect(increment(state, 'morning', 'hasbiyallah', 7).morning.hasbiyallah).toBe(7);
  });
});

describe('clearOne', () => {
  it('forgets one dhikr and leaves the rest', () => {
    const state = {
      ...emptyCounts('2026-10-28'),
      morning: { one: 2, two: 5 },
    };

    expect(clearOne(state, 'morning', 'one').morning).toEqual({ two: 5 });
    expect(clearOne(state, 'morning', 'missing')).toBe(state);
  });
});

describe('countFor', () => {
  it('clamps to the rendered target and ignores junk', () => {
    const state = { ...emptyCounts('2026-10-28'), morning: { over: 9, zero: 0 } };

    expect(countFor(state, 'morning', 'over', 7)).toBe(7);
    expect(countFor(state, 'morning', 'zero')).toBe(0);
    expect(countFor(state, 'morning', 'missing')).toBe(0);
  });
});

describe('completedCount', () => {
  it('counts only the dhikr that reached their stated count', () => {
    const items = [item('a', 1), item('b', 3), item('c', 2)];
    const state = { ...emptyCounts('2026-10-28'), morning: { a: 1, b: 2, c: 2 } };

    expect(completedCount(state, 'morning', items)).toBe(2);
  });
});

describe('nextMidnightDelay', () => {
  it('is the time left until local midnight, plus a second of slack', () => {
    expect(nextMidnightDelay(new Date(2026, 9, 28, 23, 0, 0))).toBe(3_600_000 + 1_000);
  });
});
