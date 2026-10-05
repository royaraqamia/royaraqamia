'use client';

export function formatRate(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function ChangeBadge({ changePct }: { changePct: number | null }) {
  if (changePct === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const up = changePct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold ${up ? 'text-success' : 'text-destructive'}`}
      dir="ltr"
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(changePct).toFixed(2)}%
    </span>
  );
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
