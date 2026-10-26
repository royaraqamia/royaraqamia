import { BookOpen, Cpu, Globe2, Landmark, Layers, TrendingUp, type LucideIcon } from 'lucide-react';

import type { NewsCategory, NewsRegion } from '@/shared/contracts/news';

/** The icon each category chip and story badge uses. */
export const NEWS_CATEGORY_ICONS: Record<NewsCategory, LucideIcon> = {
  tech: Cpu,
  politics: Landmark,
  religion: BookOpen,
  economy: TrendingUp,
  world: Globe2,
  other: Layers,
};

/** A tone per category, so a long digest is scannable without reading the chip. */
export const NEWS_CATEGORY_TONES: Record<NewsCategory, string> = {
  tech: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  politics: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  religion: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  economy: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  world: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  other: 'border-border/60 bg-muted text-muted-foreground',
};

export const NEWS_REGION_ICONS: Record<NewsRegion, LucideIcon> = {
  arab: Globe2,
  islamic: BookOpen,
  world: Globe2,
};

/**
 * "قبل 4 ساعات" for a source timestamp.
 *
 * Rendered on the server only (the story cards are server components), so the
 * clock read cannot disagree with a hydrating client. An absent timestamp simply
 * renders nothing rather than "قبل 56 سنة" from an epoch fallback.
 */
export function formatRelativeTime(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return 'الآن';

  const formatter = new Intl.RelativeTimeFormat('ar-SY-u-nu-latn', { numeric: 'auto' });
  if (minutes < 60) return formatter.format(-minutes, 'minute');

  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');

  const days = Math.round(hours / 24);
  return formatter.format(-days, 'day');
}

/**
 * When a snapshot was taken, in the reader's own clock (#555).
 *
 * The digest's date says which morning it reports; this says when the reader
 * last saw it, which is the difference between "yesterday's news" and "the news
 * as it stood when I last had a connection". A timestamp the clock cannot parse
 * renders nothing rather than an epoch fallback.
 */
export function formatCapturedAt(iso: string, locale = 'ar-SY-u-nu-latn'): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    parsed
  );
}
