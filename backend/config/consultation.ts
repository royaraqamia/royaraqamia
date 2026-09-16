import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createConsultationRepositories } from '@/backend/repositories/consultation';
import {
  ConsultationService,
  generateConsultationReferenceCode,
} from '@/backend/services/consultation/consultation-service';

/**
 * Bookings are anonymous and unpaid, so the `consultation_bookings` tables
 * grant nothing to anon/authenticated. Every path — public booking and admin
 * management alike — runs on the service role for that reason.
 */
function createService(supabase: SupabaseClient<Database>): ConsultationService {
  return new ConsultationService(createConsultationRepositories(supabase), {
    nowIso: () => new Date().toISOString(),
    checkRateLimit,
    generateReferenceCode: generateConsultationReferenceCode,
  });
}

/** Public booking page: create a request, list slots, read packages/settings. */
export function createPublicConsultationService(): ConsultationService {
  return createService(getAdminSupabase());
}

/** Full-privilege service for requireAdminAuth-guarded endpoints. */
export function createAdminConsultationService(): ConsultationService {
  return createService(getAdminSupabase());
}
