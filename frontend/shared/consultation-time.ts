import type { AvailabilitySlot } from '@/shared/contracts/consultation';

export const DAMASCUS_TIME_ZONE = 'Asia/Damascus';

const dateOptions: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  calendar: 'islamic-umalqura',
  numberingSystem: 'latn',
};

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  numberingSystem: 'latn',
};

const dayKeyOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ar-SA', { ...options, timeZone }).format(date);
}

/** e.g. "الأربعاء، 13 ربيع الأول 1448 هـ" (Hijri) in the visitor's timezone. */
export function formatSessionDateLocal(iso: string): string {
  return format(new Date(iso), localTimeZone(), dateOptions);
}

/** e.g. "7:00 م" in the visitor's timezone. */
export function formatSessionTimeLocal(iso: string): string {
  return format(new Date(iso), localTimeZone(), timeOptions);
}

/** e.g. "الأربعاء، 13 ربيع الأول 1448 هـ" (Hijri) in Damascus time. */
export function formatSessionDateDamascus(iso: string): string {
  return format(new Date(iso), DAMASCUS_TIME_ZONE, dateOptions);
}

/** e.g. "7:00 م" in Damascus time. */
export function formatSessionTimeDamascus(iso: string): string {
  return format(new Date(iso), DAMASCUS_TIME_ZONE, timeOptions);
}

function formatTimeRange(startsAt: string, endsAt: string, timeZone: string): string {
  return `${format(new Date(startsAt), timeZone, timeOptions)} – ${format(
    new Date(endsAt),
    timeZone,
    timeOptions
  )}`;
}

/** Local-time range for a slot, e.g. "7:00 م – 8:00 م". */
export function formatSessionTimeRangeLocal(slot: AvailabilitySlot): string {
  return formatTimeRange(slot.starts_at, slot.ends_at, localTimeZone());
}

function dayKeyInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { ...dayKeyOptions, timeZone }).format(new Date(iso));
}

/** Stable local-calendar-day key for grouping slots, e.g. "2026-08-26". */
export function sessionDayKeyLocal(iso: string): string {
  return dayKeyInTimeZone(iso, localTimeZone());
}

/**
 * Damascus-time hint for visitors outside Damascus; null when the visitor is
 * already on Damascus time (repeating identical times would be redundant).
 */
export function formatSessionDamascusHint(slot: AvailabilitySlot): string | null {
  const localTz = localTimeZone();
  if (localTz === DAMASCUS_TIME_ZONE) return null;
  const dayDiffers =
    dayKeyInTimeZone(slot.starts_at, localTz) !==
    dayKeyInTimeZone(slot.starts_at, DAMASCUS_TIME_ZONE);
  const range = formatTimeRange(slot.starts_at, slot.ends_at, DAMASCUS_TIME_ZONE);
  return dayDiffers ? `${formatSessionDateDamascus(slot.starts_at)} — ${range}` : range;
}

/**
 * Single-line summary used across the booking UI (Hijri date + 12h range).
 * Damascus line kept for tooltips/receipts referencing Damascus time.
 */
export function formatSessionDualLine(slot: AvailabilitySlot): {
  localLine: string;
  damascusLine: string;
} {
  return {
    localLine: `${formatSessionDateLocal(slot.starts_at)} • ${formatSessionTimeRangeLocal(slot)}`,
    damascusLine: `(${formatSessionDateDamascus(slot.starts_at)} — ${formatTimeRange(
      slot.starts_at,
      slot.ends_at,
      DAMASCUS_TIME_ZONE
    )} بتوقيت دمشق)`,
  };
}

/** "23:04:11" style countdown from remaining milliseconds. */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00:00';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
