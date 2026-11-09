import { describe, expect, it } from 'vitest';

import {
  habitflowDateFromSearch,
  isHabitflowDateKey,
  searchWithHabitflowDate,
} from '@/frontend/state/habitflow/habitflow-date-url';

const TODAY = '2026-11-09';

describe('the HabitFlow day in the URL (ADR-0147)', () => {
  it('accepts only a real calendar day in the key format', () => {
    expect(isHabitflowDateKey('2026-11-09')).toBe(true);
    expect(isHabitflowDateKey('2024-02-29')).toBe(true);
    expect(isHabitflowDateKey('2026-02-30')).toBe(false);
    expect(isHabitflowDateKey('2026-1-9')).toBe(false);
    expect(isHabitflowDateKey('09-11-2026')).toBe(false);
    expect(isHabitflowDateKey(null)).toBe(false);
    expect(isHabitflowDateKey('')).toBe(false);
  });

  it('reads the day, and ignores a parameter that is not one', () => {
    expect(habitflowDateFromSearch('?date=2026-11-01')).toBe('2026-11-01');
    expect(habitflowDateFromSearch('?date=tomorrow')).toBeNull();
    expect(habitflowDateFromSearch('?create=1')).toBeNull();
    expect(habitflowDateFromSearch('')).toBeNull();
  });

  it('writes the day and keeps the rest of the query', () => {
    expect(searchWithHabitflowDate('', '2026-11-01', TODAY)).toBe('date=2026-11-01');
    expect(searchWithHabitflowDate('?create=1', '2026-11-01', TODAY)).toBe(
      'create=1&date=2026-11-01'
    );
    expect(searchWithHabitflowDate('?date=2026-11-01', '2026-11-02', TODAY)).toBe(
      'date=2026-11-02'
    );
  });

  it('leaves today out of the URL so the bare link keeps meaning today', () => {
    expect(searchWithHabitflowDate('?date=2026-11-01', TODAY, TODAY)).toBe('');
    expect(searchWithHabitflowDate('?date=2026-11-01&create=1', TODAY, TODAY)).toBe('create=1');
  });
});
