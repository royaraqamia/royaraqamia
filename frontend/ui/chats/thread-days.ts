import type { ChatMessage } from '@/shared/contracts/chat';

/**
 * The thread's date separators (#1111). The key that decides whether a
 * separator is drawn and the label that names it have to read one calendar, or
 * the thread disagrees with itself around midnight: slicing the ISO string
 * groups by UTC, while the label names the reader's local day.
 *
 * The calendar is the reader's own — the day the label already spoke — so both
 * sides take the same `timeZone`, which a test pins to make the boundary
 * reproducible.
 */
type DayFormats = { label: Intl.DateTimeFormat; key: Intl.DateTimeFormat };
type DatedMessage = Pick<ChatMessage, 'createdAt'>;

function makeFormats(timeZone?: string): DayFormats {
  const zone = timeZone ? { timeZone } : {};
  return {
    label: new Intl.DateTimeFormat('ar-u-nu-latn', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...zone,
    }),
    // en-CA renders `YYYY-MM-DD`, the same shape `dayKey` used to slice out of
    // the ISO string.
    key: new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...zone,
    }),
  };
}

/** The component reads the local day, so that is the formatter pair it uses. */
const LOCAL_FORMATS = makeFormats();
const ZONE_FORMATS = new Map<string, DayFormats>();

function formatsFor(timeZone?: string): DayFormats {
  if (!timeZone) return LOCAL_FORMATS;
  const cached = ZONE_FORMATS.get(timeZone);
  if (cached) return cached;
  const formats = makeFormats(timeZone);
  ZONE_FORMATS.set(timeZone, formats);
  return formats;
}

/** The calendar day `iso` falls in, in the same zone the label uses. */
export function dayKey(iso: string, timeZone?: string): string {
  return formatsFor(timeZone).key.format(new Date(iso));
}

/** Whether the thread draws a separator before `message`. */
export function isNewDay(
  previous: DatedMessage | undefined,
  message: DatedMessage,
  timeZone?: string
): boolean {
  return !previous || dayKey(previous.createdAt, timeZone) !== dayKey(message.createdAt, timeZone);
}

/** The separator's text, e.g. «السبت، 7 نوفمبر». */
export function formatDaySeparator(at: string, timeZone?: string): string {
  return formatsFor(timeZone).label.format(new Date(at));
}
