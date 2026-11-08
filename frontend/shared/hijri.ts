/**
 * Umm al-Qura conversion, the two directions the schedule UI needs.
 *
 * There is no calendar library in the tree: `Intl` already knows the
 * `islamic-umalqura` calendar every date on the site is rendered with, so the
 * forward direction is a formatter and the reverse direction is a bounded scan
 * around an estimate (a Hijri year is ~354.37 days). The scan is a few dozen
 * comparisons, which is cheaper than a dependency and exact, because it asks the
 * same formatter the display uses rather than reimplementing the tables.
 */

export interface HijriParts {
  year: number;
  /** 1-12, where 1 is Muharram. */
  month: number;
  day: number;
}

/** The twelve Umm al-Qura months, in order. */
export const HIJRI_MONTHS = [
  'محرَّم',
  'صفر',
  'ربيع الأوَّل',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوَّال',
  'ذو القعدة',
  'ذو الحجَّة',
] as const;

const partsFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  numberingSystem: 'latn',
  timeZone: 'UTC',
});

/** The Hijri year, month and day a Gregorian instant falls on. */
export function toHijriParts(date: Date): HijriParts {
  const parts = partsFormatter.formatToParts(date);
  const read = (type: 'year' | 'month' | 'day'): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number(value);
  };
  return { year: read('year'), month: read('month'), day: read('day') };
}

function utcDay(date: Date): number {
  return Math.round(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000
  );
}

/** The Gregorian instant of a Hijri date, at UTC midnight. */
export function fromHijriParts({ year, month, day }: HijriParts): Date {
  // 1 Muharram 1 AH is 622-07-19 (Julian) in the Umm al-Qura reckoning; the
  // estimate only has to land close enough for the scan below to find the day.
  const daysIntoYear = (month - 1) * 29.5306 + (day - 1);
  const estimate =
    Date.UTC(622, 6, 19) + Math.round(((year - 1) * 354.367 + daysIntoYear) * 86_400_000);
  const start = Math.floor(estimate / 86_400_000) - 60;

  for (let offset = 0; offset <= 120; offset += 1) {
    const candidate = new Date((start + offset) * 86_400_000);
    const parts = toHijriParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day) {
      return candidate;
    }
  }

  // The scan above covers 180 days either way, more than any Hijri year; a
  // miss would mean the formatter and this file disagree, so fail loudly.
  throw new Error(`No Gregorian day for ${year}-${month}-${day} AH`);
}

/** How many days the given Hijri month has. */
export function hijriMonthLength(year: number, month: number): number {
  const first = utcDay(fromHijriParts({ year, month, day: 1 }));
  const next =
    month === 12
      ? utcDay(fromHijriParts({ year: year + 1, month: 1, day: 1 }))
      : utcDay(fromHijriParts({ year, month: month + 1, day: 1 }));
  return next - first;
}

/** The ISO date (`YYYY-MM-DD`) of a Hijri day, for storage and `<input>` values. */
export function hijriToIso(hijri: HijriParts): string {
  return fromHijriParts(hijri).toISOString().slice(0, 10);
}

/** The Hijri date an ISO date (`YYYY-MM-DD`) names, at UTC midnight. */
export function isoToHijri(iso: string): HijriParts {
  return toHijriParts(new Date(`${iso}T00:00:00.000Z`));
}
