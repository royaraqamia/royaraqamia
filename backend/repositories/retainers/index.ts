import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { Retainer } from '@/shared/contracts/retainers';
import type {
  RetainerCreateInput,
  RetainersRepository,
} from '@/backend/repositories/retainers/retainers-repository';

export function createRetainersRepository(supabase: SupabaseClient<Database>): RetainersRepository {
  return {
    async create(input: RetainerCreateInput): Promise<Retainer> {
      const { data, error } = await supabase
        .from('retainers')
        .insert({
          full_name: input.full_name,
          phone_whatsapp: input.phone_whatsapp,
          email: input.email,
          company: input.company,
          current_projects: input.current_projects,
          needs: input.needs,
          preferred_start: input.preferred_start,
          reference_code: input.reference_code,
          user_id: input.user_id,
        })
        .select()
        .single();

      if (error) throw error;

      return data as Retainer;
    },
  };
}
