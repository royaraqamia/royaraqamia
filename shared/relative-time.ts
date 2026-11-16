/**
 * «قبل 4 ساعات» — how long ago a timestamp was, in the site's words.
 *
 * Lifted out of the news digest when the community card needed the same
 * sentence: two surfaces reading one clock is the point, because a card that
 * rounds differently from the story beside it is the kind of disagreement
 * nobody reports and everybody notices.
 *
 * The ladder is minute → hour → day → week → month → year, which is what
 * `Intl.RelativeTimeFormat` already knows how to say in Arabic («قبل يومين»,
 * «قبل 3 أيام», «قبل شهر»). An absent or unparseable timestamp renders nothing
 * rather than «قبل 56 سنة» from an epoch fallback.
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
  if (days < 7) return formatter.format(-days, 'day');
  if (days < 30) return formatter.format(-Math.round(days / 7), 'week');
  if (days < 365) return formatter.format(-Math.round(days / 30), 'month');

  return formatter.format(-Math.round(days / 365), 'year');
}
