import type { HabitLog } from '@/shared/contracts/habitflow';

/**
 * Formats a date string (YYYY-MM-DD) into full localized Arabic text.
 */
export function formatArabicDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const dateObj = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(dateObj);
  } catch {
    return dateStr;
  }
}

/**
 * Extracts a safe day number from a date string.
 */
export function extractDayNumber(dateStr: string): number {
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    const day = parseInt(parts[parts.length - 1] ?? '', 10);
    if (!isNaN(day)) return day;
  }
  const fallback = new Date(dateStr).getDate();
  return isNaN(fallback) ? 1 : fallback;
}

/**
 * A day counts as frozen when a freeze (skip) was used AND no habit was
 * completed that day.
 */
export function isDayFrozen(dayLogs: HabitLog[]): boolean {
  const skipCount = dayLogs.filter((l) => l.kind === 'skip').length;
  const completedCount = dayLogs.filter((l) => l.completed).length;
  return skipCount > 0 && completedCount === 0;
}

export interface PluralForms {
  one: string;
  two: string;
  few: string;
  other: string;
}

/**
 * Returns the correct Arabic noun form for a count following the Arabic
 * plural categories: 1 (singular), 2 (dual), 3-10 (plural), 11+ (singular
 * accusative/genitive in construct).
 */
export function pluralize(count: number, forms: PluralForms): string {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (count >= 3 && count <= 10) return forms.few;
  return forms.other;
}
