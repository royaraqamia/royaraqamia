/**
 * Calendar days the app counts in. A day flips at Damascus midnight, never at
 * UTC midnight: the reminder selection (`habit_damascus_day_start`), the plan
 * allowances and the push dedupe key all frame "today" the same way (ADR-0093).
 */
const DAMASCUS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Damascus',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Damascus calendar day a timestamp falls in, as `YYYY-MM-DD`. */
export function damascusDateKey(now: Date = new Date()): string {
  return DAMASCUS_DAY.format(now);
}
