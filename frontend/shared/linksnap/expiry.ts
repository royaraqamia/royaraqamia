/** The clock time a link expires at when the reader only picked a calendar day. */
export const END_OF_DAY = '23:59:59';

/**
 * The instant a link expires, from the calendar day the reader picked.
 *
 * A bare `YYYY-MM-DD` parses as midnight UTC, which in Damascus (UTC+3) is
 * 03:00 on the chosen day — a link given today's date through the bulk bar was
 * already expired as it was set. The day is meant to end where the reader's
 * clock ends it, so it is built as a local wall-clock time and handed to the
 * server as the ISO instant it is. Both the bulk bar and the single-row editor
 * go through here, which is what keeps the two paths from drifting a day apart.
 *
 * An empty `time` (the form's "not chosen") means the end of the day.
 */
export function expiryInstant(date: string, time?: string): string {
  return new Date(`${date}T${time?.trim() || END_OF_DAY}`).toISOString();
}
