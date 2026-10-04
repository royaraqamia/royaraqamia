import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createFrankfurterProvider } from '@/backend/clients/rates/fiat-rate-provider';
import { createGoldApiProvider } from '@/backend/clients/rates/metal-price-provider';
import { createRatesRepository } from '@/backend/repositories/rates';
import { RatesService } from '@/backend/services/rates/rates-service';

export function createRatesService(supabase: SupabaseClient<Database>): RatesService {
  return new RatesService(
    createRatesRepository(supabase),
    createFrankfurterProvider(),
    createGoldApiProvider()
  );
}
