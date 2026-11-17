import { loadAthkar } from '@/backend/loaders/athkar';
import {
  ATHKAR_PERIODS,
  ATHKAR_PERIOD_LABELS,
  type AthkarCollection,
  type AthkarPeriod,
} from '@/shared/contracts/athkar';

/**
 * The Athkar as a server-side caller reads them (#1430, ADR-0205).
 *
 * The text is the vendored asset the page draws, read and validated once per
 * process by the same loader, so a tool cannot answer a different wording from
 * the one on screen. There is no database and nothing to write: a set is a
 * collection and its items, and the door is the same two periods the surface has.
 */

export interface AthkarSetCard {
  period: AthkarPeriod;
  title: string;
  /** What the page calls the set: «أذكار الصباح» / «أذكار المساء». */
  label: string;
  count: number;
}

/** The two sets, in the order the page lists them. */
export async function listAthkarSets(): Promise<AthkarSetCard[]> {
  const collections = await Promise.all(ATHKAR_PERIODS.map((period) => loadAthkar(period)));

  return collections.map((collection) => ({
    period: collection.period,
    title: collection.title,
    label: ATHKAR_PERIOD_LABELS[collection.period],
    count: collection.items.length,
  }));
}

/** One set with its items, or null when the period is not one of the two. */
export async function readAthkarSet(period: AthkarPeriod): Promise<AthkarCollection | null> {
  if (!ATHKAR_PERIODS.includes(period)) return null;
  return loadAthkar(period);
}
