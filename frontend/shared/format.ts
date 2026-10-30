export function formatDateArabic(dateStr: string): string {
  return formatHijriDate(dateStr);
}

export function isCertificateExpired(expirationDate: string | null): boolean {
  if (!expirationDate) return false;
  const todayUTC = new Date().toISOString().slice(0, 10);
  return todayUTC > expirationDate;
}

/**
 * Whether a date-only column is behind today's calendar day.
 *
 * The calendar day is read locally rather than in UTC (unlike `isCertificateExpired`):
 * this compares a date a human typed about a real-world agreement to the day the
 * human is reading it, so the local day is the meaningful frame.
 *
 * It is deliberately factual — "the date has passed", nothing more. Whether a payment
 * actually lagging is normal or a problem is a judgement the Admin makes, because
 * collection is offline (ADR-0006).
 */
export function hasDatePassed(date: string | null): boolean {
  if (!date) return false;
  return localIsoDate() > date;
}

function localIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Counts and caps read as ASCII digits with grouping (`10,000`), never
 * an Arabic-locale numeral system. Read-only figures only — an editable input
 * keeps the raw value.
 */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatHijriDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return String(date);
  const baseOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'islamic-umalqura',
    numberingSystem: 'latn',
    ...options,
  };
  return new Intl.DateTimeFormat('ar-SA', baseOptions).format(parsed);
}

/** What a past instant is, before any surface puts it into words (ADR-0104). */
export type TimeAgoParts =
  | { unit: 'now' }
  | { unit: 'minutes' | 'hours' | 'days' | 'weeks'; count: number }
  | { unit: 'date' };

/**
 * The thresholds of "time ago", as a unit and a count rather than a sentence.
 *
 * The words belong to the surface that renders them — its own layer's generated
 * copy with `{count}` substituted — because a finished Arabic sentence cannot be
 * ported without spelling it again in Kotlin ([ADR-0104](../adr/0104-a-shared-formatter-returns-parts-not-sentences.md)).
 * `now` is an argument so a test can hold the boundaries still.
 */
export function timeAgoParts(dateStr: string, now: number = Date.now()): TimeAgoParts {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return { unit: 'date' };

  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return { unit: 'now' };

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { unit: 'minutes', count: diffMin };

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return { unit: 'hours', count: diffHour };

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return { unit: 'days', count: diffDay };

  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return { unit: 'weeks', count: diffWeek };

  return { unit: 'date' };
}

/**
 * The sentence form, kept for the surfaces that have not been ported yet
 * (ADR-0104). It renders [timeAgoParts] in this module's own words; it is deleted
 * with the last of those surfaces, and no new caller may use it.
 */
export function calculateTimeAgo(dateStr: string): string {
  const parts = timeAgoParts(dateStr);
  switch (parts.unit) {
    case 'now':
      return 'منذ لحظات';
    case 'minutes':
      return `منذ ${parts.count} دقيقة`;
    case 'hours':
      return `منذ ${parts.count} ساعة`;
    case 'days':
      return `منذ ${parts.count} يوم`;
    case 'weeks':
      return `منذ ${parts.count} أسبوع`;
    case 'date':
      return formatHijriDate(dateStr);
  }
}
