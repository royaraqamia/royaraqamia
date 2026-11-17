import { relativeTimeParts, type RelativeTimeParts } from '@/shared/relative-time';
import { POST_TIME_COPY } from './post-time-copy';

/**
 * How long ago an instant was, in the site's words (#1580).
 *
 * The feed card and the comment thread print the same sentence for the same
 * timestamp, and the app draws both, so the words come from generated copy
 * instead of `Intl.RelativeTimeFormat` — ICU knows Arabic's plural forms, but
 * only on the platform that owns it (ADR-0098). The clock is still
 * `relativeTimeParts`, the one ladder both clients round with.
 *
 * Arabic picks a form by count (CLDR `ar`): one, two, 3-10, 11-99, and 100+.
 * The copy carries only the forms a rung can reach, so months stop at `many`
 * (a month is 1-12) and days and weeks at `few` (1-6 and 1-4).
 */
type Form = 'one' | 'two' | 'few' | 'many' | 'other';

function form(count: number): Form {
  if (count === 1) return 'one';
  if (count === 2) return 'two';
  const mod = count % 100;
  if (mod >= 3 && mod <= 10) return 'few';
  if (mod >= 11 && mod <= 99) return 'many';
  return 'other';
}

/** `1234` → `1,234`: the separator `Intl` writes for `ar-SY-u-nu-latn`. */
function grouped(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function sentence(parts: RelativeTimeParts): string {
  const plural = form(parts.count);

  switch (parts.unit) {
    case 'now':
      return POST_TIME_COPY.now;
    case 'minutes':
      if (plural === 'one') return POST_TIME_COPY.minuteOne;
      if (plural === 'two') return POST_TIME_COPY.minuteTwo;
      if (plural === 'few') return POST_TIME_COPY.minuteFew;
      return POST_TIME_COPY.minuteMany;
    case 'hours':
      if (plural === 'one') return POST_TIME_COPY.hourOne;
      if (plural === 'two') return POST_TIME_COPY.hourTwo;
      if (plural === 'few') return POST_TIME_COPY.hourFew;
      return POST_TIME_COPY.hourMany;
    case 'days':
      if (plural === 'one') return POST_TIME_COPY.dayOne;
      if (plural === 'two') return POST_TIME_COPY.dayTwo;
      // The ladder stops at six days, so `many` is unreachable here.
      return POST_TIME_COPY.dayFew;
    case 'weeks':
      if (plural === 'one') return POST_TIME_COPY.weekOne;
      if (plural === 'two') return POST_TIME_COPY.weekTwo;
      // The ladder stops at four weeks, so `many` is unreachable here.
      return POST_TIME_COPY.weekFew;
    case 'months':
      if (plural === 'one') return POST_TIME_COPY.monthOne;
      if (plural === 'two') return POST_TIME_COPY.monthTwo;
      if (plural === 'few') return POST_TIME_COPY.monthFew;
      return POST_TIME_COPY.monthMany;
    case 'years':
      if (plural === 'one') return POST_TIME_COPY.yearOne;
      if (plural === 'two') return POST_TIME_COPY.yearTwo;
      if (plural === 'few') return POST_TIME_COPY.yearFew;
      if (plural === 'many') return POST_TIME_COPY.yearMany;
      return POST_TIME_COPY.yearOther;
  }
}

/** The sentence alone, for the ladder's test and any surface that needs the text. */
export function postTimeLabel(iso: string | null, now: number = Date.now()): string | null {
  const parts = relativeTimeParts(iso, now);
  if (!parts) return null;
  return sentence(parts).replace('{count}', grouped(parts.count));
}

interface PostTimeProps {
  /** The instant to describe. A string that is not one draws nothing, as on the page. */
  iso: string | null;
  className?: string;
}

/**
 * The card's and the thread's age line: one `<time>`, one sentence.
 *
 * It draws no box of its own — the caller owns the type scale and the colour —
 * so the footer's meta line and a comment's meta line stay their own rows while
 * agreeing on the words.
 */
export function PostTime({ iso, className }: PostTimeProps) {
  const label = postTimeLabel(iso);
  if (!iso || !label) return null;
  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  );
}
