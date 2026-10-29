import { createUsageService } from '@/backend/config/plans';
import { logger } from '@/backend/shared/logger';
import type { NewsBoard } from '@/shared/contracts/news';

/**
 * What a visitor may see: one story card. Mirrors
 * `plan_quotas['news.story.cards'].visitor_cap`, which the database is the
 * authority for; a visitor has no account, so the caller cannot ask it.
 */
export const VISITOR_NEWS_CARDS = 1;

/**
 * How many cards this reader's plan may show.
 *
 * A failed read answers the Free number rather than failing the page: the news
 * board is public content, and a counter that cannot be read must not blank it.
 */
export async function resolveNewsCardCap(userId: string | null): Promise<number> {
  if (!userId) return VISITOR_NEWS_CARDS;

  try {
    return await createUsageService().newsCardCap(userId);
  } catch (error) {
    logger.warn("Failed to read the reader's news card cap", { error: String(error) });
    return 5;
  }
}

/**
 * Cut the board down to the plan's card allowance.
 *
 * The page is never withheld: the archive strip, the filters and the search box
 * stay, and only the number of story cards changes. Both the day's cards and
 * the search hits are capped — leaving search uncapped would be a one-click way
 * around the limit. `cards` is set only when something was actually hidden, and
 * it carries the total so the page can say "5 of 12" instead of silently
 * shortening.
 */
export function applyNewsCardLimit(board: NewsBoard, cap: number, visitor: boolean): NewsBoard {
  const day = board.day;
  if (day && day.stories.length > cap) {
    return {
      ...board,
      day: { ...day, stories: day.stories.slice(0, cap) },
      cards: { cap, total: day.stories.length, shown: cap, visitor },
    };
  }

  const search = board.search;
  if (search && search.hits.length > cap) {
    return {
      ...board,
      search: { ...search, hits: search.hits.slice(0, cap) },
      cards: { cap, total: search.hits.length, shown: cap, visitor },
    };
  }

  return board.cards === null ? board : { ...board, cards: null };
}
