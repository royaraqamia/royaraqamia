import 'server-only';

import { unstable_cache } from 'next/cache';
import { createRatesService } from '@/backend/config/rates';
import { getAdminSupabase, getPublicSupabase } from '@/backend/config/supabase';
import { RATES_TAGS } from '@/backend/shared/rates-cache-tags';
import type { RatesBoard } from '@/shared/contracts/rates';

const RATES_CACHE_SECONDS = 3600;

export const loadRatesBoard = unstable_cache(
  async (): Promise<RatesBoard | null> => {
    try {
      const publicService = createRatesService(getPublicSupabase());
      const board = await publicService.getBoard();
      if (board) return board;

      await createRatesService(getAdminSupabase()).refresh();
      return await publicService.getBoard();
    } catch {
      return null;
    }
  },
  ['rates-board'],
  { revalidate: RATES_CACHE_SECONDS, tags: [RATES_TAGS.board] }
);
