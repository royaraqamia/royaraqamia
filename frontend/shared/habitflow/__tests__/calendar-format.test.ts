import { describe, it, expect } from 'vitest';
import {
  formatArabicDate,
  extractDayNumber,
  isDayFrozen,
  pluralize,
} from '@/frontend/shared/habitflow/calendar-format';
import type { HabitLog } from '@/shared/contracts/habitflow';

function log(date: string, completed: boolean, kind?: HabitLog['kind']): HabitLog {
  return {
    id: `l-${date}`,
    habitId: 'h1',
    date,
    completed,
    completedAt: null,
    kind,
  };
}

describe('formatArabicDate', () => {
  it('formats a valid YYYY-MM-DD date into Arabic text', () => {
    expect(formatArabicDate('2026-08-18')).toContain('أغسطس');
    expect(formatArabicDate('2026-01-05')).toContain('يناير');
  });

  it('returns the input unchanged when the date is not parseable', () => {
    expect(formatArabicDate('bad')).toBe('bad');
    expect(formatArabicDate('')).toBe('');
  });
});

describe('extractDayNumber', () => {
  it('extracts the day from a YYYY-MM-DD string', () => {
    expect(extractDayNumber('2026-08-18')).toBe(18);
    expect(extractDayNumber('2026-08-01')).toBe(1);
  });

  it('falls back to 1 for unparseable input', () => {
    expect(extractDayNumber('garbage')).toBe(1);
  });
});

describe('isDayFrozen', () => {
  it('returns true only when a skip exists and nothing was completed', () => {
    expect(isDayFrozen([log('2026-08-01', false, 'skip')])).toBe(true);
    expect(isDayFrozen([log('2026-08-01', false, 'skip'), log('2026-08-01', true)])).toBe(false);
    expect(isDayFrozen([log('2026-08-01', false, 'miss')])).toBe(false);
    expect(isDayFrozen([log('2026-08-01', true)])).toBe(false);
    expect(isDayFrozen([])).toBe(false);
  });
});

describe('pluralize', () => {
  const forms = { one: 'عادة', two: 'عادتين', few: 'عادات', other: 'عادة' };

  it('applies the Arabic singular/dual/plural categories', () => {
    expect(pluralize(1, forms)).toBe('عادة');
    expect(pluralize(2, forms)).toBe('عادتين');
    expect(pluralize(3, forms)).toBe('عادات');
    expect(pluralize(10, forms)).toBe('عادات');
    expect(pluralize(11, forms)).toBe('عادة');
    expect(pluralize(0, forms)).toBe('عادة');
  });
});
