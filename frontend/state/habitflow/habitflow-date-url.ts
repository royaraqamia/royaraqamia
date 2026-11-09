/**
 * The selected day in the address bar (ADR-0147).
 *
 * A day is a view of the dashboard, not a second screen: `?date=YYYY-MM-DD`
 * survives a refresh and can be shared, while the edit modal, the note dialog
 * and the forms stay out of the URL. Today is the default and is therefore
 * written without the parameter, so the bare `/habitflow` link keeps meaning
 * "today" tomorrow.
 */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar day in the one key format the page writes. */
export function isHabitflowDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The day the URL names, or null when it names none or nonsense. */
export function habitflowDateFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('date');
  return isHabitflowDateKey(value) ? value : null;
}

/**
 * The query string with the selected day, without dropping the parameters that
 * are not the day (`?create=1`, for instance).
 */
export function searchWithHabitflowDate(search: string, date: string, today: string): string {
  const params = new URLSearchParams(search);
  if (!isHabitflowDateKey(date) || date === today) params.delete('date');
  else params.set('date', date);
  return params.toString();
}
