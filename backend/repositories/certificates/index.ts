import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { Certificate } from '@/shared/contracts/certificates';
import type {
  CertificateCreateInput,
  CertificateUpdateInput,
  CertificatesRepository,
} from '@/backend/repositories/certificates/certificates-repository';

export function createCertificatesRepository(
  supabase: SupabaseClient<Database>
): CertificatesRepository {
  return {
    async getByCode(code: string): Promise<Certificate | null> {
      const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('certificate_code', code)
        .single();

      if (error || !data) return null;
      return data as Certificate;
    },

    async list(
      page: number,
      pageSize: number,
      search: string
    ): Promise<{ data: Certificate[]; total: number }> {
      let query = supabase
        .from('certificates')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(
          `student_name.ilike.%${search}%,course_name.ilike.%${search}%,certificate_code.ilike.%${search}%`
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count } = await query.range(from, to);

      return { data: (data as Certificate[]) ?? [], total: count ?? 0 };
    },

    async getById(id: string): Promise<Certificate | null> {
      const { data, error } = await supabase.from('certificates').select('*').eq('id', id).single();

      if (error || !data) return null;
      return data as Certificate;
    },

    async create(input: CertificateCreateInput): Promise<Certificate> {
      const { data, error } = await supabase
        .from('certificates')
        .insert({
          certificate_code: input.certificate_code,
          student_name: input.student_name,
          course_name: input.course_name,
          issue_date: input.issue_date,
          expiration_date: input.expiration_date,
          grade_or_status: input.grade_or_status,
          recipient_email: input.recipient_email ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return data as Certificate;
    },

    async update(id: string, input: CertificateUpdateInput): Promise<Certificate> {
      const { data, error } = await supabase
        .from('certificates')
        .update({
          student_name: input.student_name,
          course_name: input.course_name,
          issue_date: input.issue_date,
          expiration_date: input.expiration_date,
          grade_or_status: input.grade_or_status,
          recipient_email: input.recipient_email ?? null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as Certificate;
    },

    async delete(id: string): Promise<void> {
      const { error } = await supabase.from('certificates').delete().eq('id', id);

      if (error) throw error;
    },
  };
}

export type { Certificate };
