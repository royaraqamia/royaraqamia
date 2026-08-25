import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { ConsultationPackage, PackageUpsertInput } from '@/shared/contracts/consultation';
import type {
  ConsultationPackagesReader,
  ConsultationPackagesWriter,
} from '@/backend/repositories/consultation/consultation-repository';

type ConsultationPackageRow = Database['public']['Tables']['consultation_packages']['Row'];

function toPackage(row: ConsultationPackageRow): ConsultationPackage {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price_usd: row.price_usd,
    duration_minutes: row.duration_minutes,
    sessions_count: row.sessions_count,
    is_active: row.is_active,
    sort_order: row.sort_order,
  };
}

export function createSupabaseConsultationPackagesRepository(
  supabase: SupabaseClient<Database>
): ConsultationPackagesReader & ConsultationPackagesWriter {
  return {
    async listActive(): Promise<ConsultationPackage[]> {
      const { data, error } = await supabase
        .from('consultation_packages')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(toPackage);
    },

    async listAll(): Promise<ConsultationPackage[]> {
      const { data, error } = await supabase
        .from('consultation_packages')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(toPackage);
    },

    async getById(id): Promise<ConsultationPackage | null> {
      const { data, error } = await supabase
        .from('consultation_packages')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data ? toPackage(data) : null;
    },

    async create(input: PackageUpsertInput): Promise<ConsultationPackage> {
      const { data, error } = await supabase
        .from('consultation_packages')
        .insert({
          name: input.name,
          description: input.description ?? null,
          price_usd: input.price_usd,
          duration_minutes: input.duration_minutes,
          sessions_count: input.sessions_count,
          is_active: input.is_active,
          sort_order: input.sort_order,
        })
        .select('*')
        .single();

      if (error) throw error;
      return toPackage(data);
    },

    async update(id, input: PackageUpsertInput): Promise<ConsultationPackage> {
      const { data, error } = await supabase
        .from('consultation_packages')
        .update({
          name: input.name,
          description: input.description ?? null,
          price_usd: input.price_usd,
          duration_minutes: input.duration_minutes,
          sessions_count: input.sessions_count,
          is_active: input.is_active,
          sort_order: input.sort_order,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return toPackage(data);
    },

    async remove(id): Promise<void> {
      const { error } = await supabase.from('consultation_packages').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
