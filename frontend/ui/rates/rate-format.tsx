'use client';

export function formatRate(value: number): string {
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateLabel(value: string | null): string {
  if (!value) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date);
}

export function formatHijriDateLabel(value: string | null): string {
  if (!value) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date);
}
