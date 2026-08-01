import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/shared/contracts/database.types';

export type Certificate = Tables<'certificates'>;

export async function getCertificateByCode(
  supabase: SupabaseClient<Database>,
  code: string
): Promise<Certificate | null> {
  try {
    const { data, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('certificate_code', code)
      .single();

    if (error || !data) return null;
    return data as Certificate;
  } catch {
    return null;
  }
}
