import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createFrankfurterProvider } from '@/backend/clients/rates/fiat-rate-provider';
import { createGoldApiProvider } from '@/backend/clients/rates/metal-price-provider';
import { createSpTodayProvider } from '@/backend/clients/rates/syp-market-provider';
import { createSypAwareFiatProvider } from '@/backend/clients/rates/syp-aware-fiat-provider';
import { createRatesRepository } from '@/backend/repositories/rates';
import { RatesService } from '@/backend/services/rates/rates-service';

/**
 * Alerts when the SYP market read falls back to the ECB reference rate. A
 * `no_quote` reason means the feed answered but we could not parse a rate —
 * the scraper-drift case we must not discover from a wrong number on the page.
 */
function reportSypFallback(reason: 'fetch_failed' | 'no_quote', error?: unknown): void {
  Sentry.captureMessage('SYP market rate unavailable — falling back to the reference rate', {
    level: 'warning',
    tags: { feature: 'rates', currency: 'SYP', reason },
    extra: error === undefined ? undefined : { error: String(error) },
  });
}

export function createRatesService(supabase: SupabaseClient<Database>): RatesService {
  return new RatesService(
    createRatesRepository(supabase),
    createSypAwareFiatProvider(createFrankfurterProvider(), createSpTodayProvider(), {
      onFallback: reportSypFallback,
    }),
    createGoldApiProvider()
  );
}
