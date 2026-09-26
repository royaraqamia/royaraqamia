import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { Certificate } from '@/shared/contracts/certificates';
import type {
  CertificateCreateInput,
  CertificateUpdateInput,
  CertificatesRepository,
} from '@/backend/repositories/certificates/certificates-repository';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';
import { isNotFoundError, repositoryFailure } from '@/backend/shared/repository-error';

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

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('certificates.getByCode', error);
      }

      return data ? (data as Certificate) : null;
    },

    async getCodes(): Promise<string[]> {
      const { data, error } = await supabase
        .from('certificates')
        .select('certificate_code')
        .order('certificate_code', { ascending: true });

      if (error) throw repositoryFailure('certificates.getCodes', error);

      return (data ?? [])
        .map((row) => row.certificate_code)
        .filter((code): code is string => typeof code === 'string' && code.length > 0);
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

      const term = sanitizeOrFilterTerm(search);
      if (term) {
        query = query.or(
          `student_name.ilike.%${term}%,course_name.ilike.%${term}%,certificate_code.ilike.%${term}%`
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query.range(from, to);

      if (error) throw repositoryFailure('certificates.list', error);

      return { data: (data as Certificate[]) ?? [], total: count ?? 0 };
    },

    async getById(id: string): Promise<Certificate | null> {
      const { data, error } = await supabase.from('certificates').select('*').eq('id', id).single();

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('certificates.getById', error);
      }

      return data ? (data as Certificate) : null;
    },

    async listByRecipient(userId: string): Promise<Certificate[]> {
      const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .contains('recipient_user_ids', [userId])
        .order('issue_date', { ascending: false });

      if (error) throw repositoryFailure('certificates.listByRecipient', error);

      return (data as Certificate[]) ?? [];
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
          recipient_user_ids: input.recipient_user_ids,
          created_by: input.created_by ?? null,
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
          recipient_user_ids: input.recipient_user_ids,
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
