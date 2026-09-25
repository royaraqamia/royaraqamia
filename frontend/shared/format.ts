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

export function calculateTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'منذ لحظات';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `منذ ${diffWeek} أسبوع`;
  return formatHijriDate(dateStr);
}
