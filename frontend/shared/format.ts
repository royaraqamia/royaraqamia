export function formatDateArabic(dateStr: string): string {
  return formatHijriDate(dateStr);
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
