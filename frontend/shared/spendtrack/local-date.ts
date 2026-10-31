import { format } from 'date-fns';

/**
 * The device's own calendar day as `yyyy-MM-dd`.
 *
 * An Expense is keyed by the local day: the dashboard and the list derive their
 * month window from the device clock, so a new Expense has to be dated the same
 * way. `toISOString()` answers the UTC day instead, which is the previous day for
 * Damascus between 00:00 and 03:00 local.
 */
export function localDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** The device's own calendar month as `yyyy-MM`. */
export function localMonth(): string {
  return format(new Date(), 'yyyy-MM');
}
