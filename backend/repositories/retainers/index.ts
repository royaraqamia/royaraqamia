import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { Retainer } from '@/shared/contracts/retainers';
import type {
  RetainerCreateInput,
  RetainerListQuery,
  RetainerUpdate,
  RetainersRepository,
} from '@/backend/repositories/retainers/retainers-repository';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';

export function createRetainersRepository(supabase: SupabaseClient<Database>): RetainersRepository {
  return {
    async getById(id: string): Promise<Retainer | null> {
      const { data, error } = await supabase.from('retainers').select('*').eq('id', id).single();

      if (error || !data) return null;
      return data as Retainer;
    },

    async list(query: RetainerListQuery): Promise<{ data: Retainer[]; total: number }> {
      let request = supabase
        .from('retainers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (query.status) {
        request = request.eq('status', query.status);
      }

      const search = query.search ? sanitizeOrFilterTerm(query.search) : '';
      if (search) {
        request = request.or(
          `full_name.ilike.%${search}%,phone_whatsapp.ilike.%${search}%,reference_code.ilike.%${search}%`
        );
      }

      const from = (query.page - 1) * query.pageSize;
      const { data, count } = await request.range(from, from + query.pageSize - 1);

      return { data: (data as Retainer[]) ?? [], total: count ?? 0 };
    },

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

    async update(id: string, input: RetainerUpdate): Promise<Retainer> {
      const { data, error } = await supabase
        .from('retainers')
        .update({
          status: input.status,
          notes: input.notes,
          monthly_fee_usd: input.monthly_fee_usd,
          paid_through: input.paid_through,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as Retainer;
    },
  };
}
