import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createAlgeriaRateProvider } from '@/backend/clients/rates/algeria-rate-provider';
import { createFrankfurterProvider } from '@/backend/clients/rates/fiat-rate-provider';
import { createIraqRateProvider } from '@/backend/clients/rates/iraq-rate-provider';
import { createLirascopeProvider } from '@/backend/clients/rates/lirascope-market-provider';
import { createGoldApiProvider } from '@/backend/clients/rates/metal-price-provider';
import { createSpTodayProvider } from '@/backend/clients/rates/syp-market-provider';
import { createSypMarketVariantProvider } from '@/backend/clients/rates/syp-market-variant-provider';
import { createCompositeVariantProvider } from '@/backend/clients/rates/variant-rate-provider';
import { createYemenRateProvider } from '@/backend/clients/rates/yemen-rate-provider';
import { createRatesRepository } from '@/backend/repositories/rates';
import { RatesService } from '@/backend/services/rates/rates-service';

/**
 * Alerts when a rate variant source (central bank or parallel market) is
 * unavailable. A missing value falls back to the reference rate, but a silent
 * regression must surface rather than become a wrong number on the page.
 */
function reportVariantFallback(source: string, error?: unknown): void {
  Sentry.captureMessage(`Rate variant source unavailable: ${source}`, {
    level: 'warning',
    tags: { feature: 'rates', source },
    extra: error === undefined ? undefined : { error: String(error) },
  });
}

export function createRatesService(supabase: SupabaseClient<Database>): RatesService {
  return new RatesService(
    createRatesRepository(supabase),
    createFrankfurterProvider(),
    createGoldApiProvider(),
    createCompositeVariantProvider(
      [
        createSypMarketVariantProvider(createSpTodayProvider()),
        createSypMarketVariantProvider(createLirascopeProvider(), 'lirascope'),
        createIraqRateProvider(),
        createAlgeriaRateProvider(),
        createYemenRateProvider(),
      ],
      { onFallback: reportVariantFallback }
    )
  );
}
