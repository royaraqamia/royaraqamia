import { describe, expect, it } from 'vitest';
import {
  fromHijriParts,
  hijriMonthLength,
  hijriToIso,
  isoToHijri,
  toHijriParts,
} from '@/frontend/shared/hijri';

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('Umm al-Qura conversion', () => {
  it('round-trips a spread of Gregorian days', () => {
    const days = ['2026-11-08', '2025-01-01', '2024-02-29', '2030-06-15', '1999-12-31'];

    for (const day of days) {
      const hijri = isoToHijri(day);
      expect(hijriToIso(hijri)).toBe(day);
      expect(hijri.day).toBeGreaterThanOrEqual(1);
      expect(hijri.day).toBeLessThanOrEqual(30);
      expect(hijri.month).toBeGreaterThanOrEqual(1);
      expect(hijri.month).toBeLessThanOrEqual(12);
    }
  });

  it('rejects a day the calendar does not have', () => {
    expect(() => fromHijriParts({ year: 1448, month: 5, day: 40 })).toThrow();
  });

  it('counts 29 or 30 days in every month of a year', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect([29, 30]).toContain(hijriMonthLength(1448, month));
    }
    expect(hijriMonthLength(1448, 1)).toBeGreaterThanOrEqual(29);
    expect(hijriMonthLength(1448, 12)).toBeLessThanOrEqual(30);
  });

  it('names the same day the formatter does', () => {
    const date = new Date('2026-11-08T00:00:00.000Z');
    const parts = toHijriParts(date);
    expect(iso(fromHijriParts(parts))).toBe(iso(date));
  });
});
