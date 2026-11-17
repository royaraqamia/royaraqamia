/**
 * «قبل 4 أسابيع» — how long ago a timestamp was, in the site's words.
 *
 * Lifted out of the news digest when the community card needed the same
 * sentence: two surfaces reading one clock is the point, because a card that
 * rounds differently from the story beside it is the kind of disagreement
 * nobody reports and everybody notices.
 *
 * The clock and the words are separate functions (#1580). `relativeTimeParts`
 * answers which unit a timestamp earns and how many of it, with the rounding
 * both clients share; `formatRelativeTime` is the digest's renderer, where the
 * platform says the words through `Intl.RelativeTimeFormat` — it already knows
 * Arabic's singular, dual and plural («أمس»، «قبل 3 أسابيع»، «قبل ساعتين»).
 * The community card and thread render the same parts from generated copy
 * instead (`app/community/_components/post-time.tsx`), because those two
 * surfaces are drawn by the app as well and a sentence one client builds with
 * ICU is a sentence the other can only guess at (ADR-0098, ADR-0104).
 *
 * The ladder is minute → hour → day → week → month → year, and the count is
 * rounded rather than truncated: a post 59 minutes old is «قبل ساعة» on both
 * clients rather than 59 minutes on one and an hour on the other. An absent or
 * unparseable timestamp renders nothing rather than «قبل 56 سنة» from an epoch
 * fallback.
 */
export type RelativeTimeUnit = 'now' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export interface RelativeTimeParts {
  /** Which sentence the timestamp earns; `now` is a count that rounds to zero. */
  unit: RelativeTimeUnit;
  /** How many of that unit, already rounded; 0 for `now`. */
  count: number;
}

/** The singular unit `Intl.RelativeTimeFormat` names, per ladder rung. */
const INTL_UNIT: Record<Exclude<RelativeTimeUnit, 'now'>, Intl.RelativeTimeFormatUnit> = {
  minutes: 'minute',
  hours: 'hour',
  days: 'day',
  weeks: 'week',
  months: 'month',
  years: 'year',
};

const formatter = new Intl.RelativeTimeFormat('ar-SY-u-nu-latn', { numeric: 'auto' });

/** The site's ladder, as a unit and a count rather than a sentence (ADR-0104). */
export function relativeTimeParts(
  iso: string | null,
  now: number = Date.now()
): RelativeTimeParts | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return { unit: 'now', count: 0 };
  if (minutes < 60) return { unit: 'minutes', count: minutes };

  const hours = Math.round(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };

  const days = Math.round(hours / 24);
  if (days < 7) return { unit: 'days', count: days };
  if (days < 30) return { unit: 'weeks', count: Math.round(days / 7) };
  if (days < 365) return { unit: 'months', count: Math.round(days / 30) };

  return { unit: 'years', count: Math.round(days / 365) };
}

/** The digest's sentence: the platform's Arabic over the site's ladder. */
export function formatRelativeTime(iso: string | null, now: number = Date.now()): string | null {
  const parts = relativeTimeParts(iso, now);
  if (!parts) return null;
  if (parts.unit === 'now') return 'الآن';
  return formatter.format(-parts.count, INTL_UNIT[parts.unit]);
}
