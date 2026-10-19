import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createQuranSyncRepository } from '@/backend/repositories/quran';
import { QuranSyncService } from '@/backend/services/quran/quran-sync-service';

/** The Quran's sync service, scoped to the caller's session client (RLS applies). */
export function createQuranSyncService(supabase: SupabaseClient<Database>): QuranSyncService {
  return new QuranSyncService(createQuranSyncRepository(supabase));
}
