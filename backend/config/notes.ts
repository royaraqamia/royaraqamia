import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createNotesRepository } from '@/backend/repositories/notes';
import { NotesService } from '@/backend/services/notes/notes-service';

/** Notes' sync service, scoped to the caller's session client (RLS applies). */
export function createNotesService(supabase: SupabaseClient<Database>): NotesService {
  return new NotesService(createNotesRepository(supabase));
}
