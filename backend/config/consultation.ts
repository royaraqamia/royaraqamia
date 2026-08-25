import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createConsultationRepositories } from '@/backend/repositories/consultation';
import { ConsultationService } from '@/backend/services/consultation/consultation-service';

/**
 * Service for the authenticated booker. Repositories run on the user's
 * cookie-bound client so RLS and the SECURITY DEFINER RPCs see the real
 * auth.uid(); the sweep bundle runs on the service role.
 */
export function createUserConsultationService(
  supabase: SupabaseClient<Database>
): ConsultationService {
  return new ConsultationService(
    createConsultationRepositories(supabase),
    {
      nowIso: () => new Date().toISOString(),
    },
    createConsultationRepositories(getAdminSupabase())
  );
}

/** Full-privilege service for requireAdminAuth-guarded endpoints. */
export function createAdminConsultationService(): ConsultationService {
  return new ConsultationService(createConsultationRepositories(getAdminSupabase()), {
    nowIso: () => new Date().toISOString(),
  });
}

/** Settings/payment display values are read server-side only (RLS denies clients). */
export function createSettingsReaderService(): ConsultationService {
  return new ConsultationService(createConsultationRepositories(getAdminSupabase()), {
    nowIso: () => new Date().toISOString(),
  });
}
