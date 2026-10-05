import 'server-only';

import { unstable_cache } from 'next/cache';
import { createRatesService } from '@/backend/config/rates';
import { getAdminSupabase, getPublicSupabase } from '@/backend/config/supabase';
import { RATES_TAGS } from '@/backend/shared/rates-cache-tags';
import { logger } from '@/backend/shared/logger';
import type { RatesBoard } from '@/shared/contracts/rates';

const RATES_CACHE_SECONDS = 3600;

/**
 * On the free plan the rate cron runs at most once a day, but the SYP market
 * rate and metal prices move intraday. The board is therefore refreshed on read
 * once it is older than this, so page traffic — not the cron — keeps it fresh.
 * The 1h cache bounds how often the refresh can run.
 */
const RATES_REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;

function isFresh(board: RatesBoard, now: number): boolean {
  const fetchedAt = new Date(board.fetchedAt).getTime();
  return Number.isFinite(fetchedAt) && now - fetchedAt < RATES_REFRESH_AFTER_MS;
}

export const loadRatesBoard = unstable_cache(
  async (): Promise<RatesBoard | null> => {
    try {
      const publicService = createRatesService(getPublicSupabase());
      const board = await publicService.getBoard();

      if (board && isFresh(board, Date.now())) return board;

      try {
        await createRatesService(getAdminSupabase()).refresh();
      } catch (error) {
        logger.warn('Rates refresh on read failed; serving the last snapshot', {
          error: String(error),
        });
        return board;
      }

      return (await publicService.getBoard()) ?? board;
    } catch (error) {
      logger.error('Failed to load the rates board', { error: String(error) });
      return null;
    }
  },
  ['rates-board'],
  { revalidate: RATES_CACHE_SECONDS, tags: [RATES_TAGS.board] }
);
