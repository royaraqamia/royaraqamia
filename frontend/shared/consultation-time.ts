import type { AvailabilitySlot } from '@/shared/contracts/consultation';

export const DAMASCUS_TIME_ZONE = 'Asia/Damascus';

const dateOptions: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  numberingSystem: 'latn',
};

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  numberingSystem: 'latn',
};

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ar', { ...options, timeZone }).format(date);
}

/** e.g. "الخميس، 27 آب 2026" in the visitor's timezone. */
export function formatSessionDateLocal(iso: string): string {
  return format(new Date(iso), localTimeZone(), dateOptions);
}

/** e.g. "17:00" in the visitor's timezone. */
export function formatSessionTimeLocal(iso: string): string {
  return format(new Date(iso), localTimeZone(), timeOptions);
}

/** e.g. "الخميس، 27 آب 2026" in Damascus time. */
export function formatSessionDateDamascus(iso: string): string {
  return format(new Date(iso), DAMASCUS_TIME_ZONE, dateOptions);
}

/** e.g. "17:00" in Damascus time. */
export function formatSessionTimeDamascus(iso: string): string {
  return format(new Date(iso), DAMASCUS_TIME_ZONE, timeOptions);
}

/** "17:00 – 18:00 (بتوقيت دمشق)" */
export function formatSessionDamascusLabel(slot: AvailabilitySlot): string {
  return `${formatSessionTimeDamascus(slot.starts_at)} – ${formatSessionTimeDamascus(slot.ends_at)} (بتوقيت دمشق)`;
}

/**
 * Dual-timezone line used across the booking UI:
 * local date + local range, then the Damascus reference.
 */
export function formatSessionDualLine(slot: AvailabilitySlot): {
  localLine: string;
  damascusLine: string;
} {
  return {
    localLine: `${formatSessionDateLocal(slot.starts_at)} • ${formatSessionTimeLocal(
      slot.starts_at
    )} – ${formatSessionTimeLocal(slot.ends_at)}`,
    damascusLine: `(${formatSessionDateDamascus(slot.starts_at)} — ${formatSessionDamascusLabel(slot)})`,
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
