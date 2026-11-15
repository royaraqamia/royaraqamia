import type { ScreenScope } from '@/frontend/state/screen-scopes';
import type { AthkarPeriod } from '@/shared/contracts/athkar';

/**
 * What `/athkar` registers while a sitting is on screen (ADR-0181, #1420).
 *
 * The sitting is the tab: `/athkar` is the morning and `/athkar/evening` the
 * evening, and on the homepage the same choice is state rather than a route, so
 * the surface is the one place that always knows which list is drawn. The counts
 * are device-local and are not published: "how many did I say?" is a question
 * about the member's day, not about the screen.
 */
export function athkarScreenScope(period: AthkarPeriod): ScreenScope {
  return { id: 'athkar.page', kind: 'screen', tab: period };
}
