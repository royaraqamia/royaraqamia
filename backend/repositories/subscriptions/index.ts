import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { SubscriptionRequest } from '@/shared/contracts/subscriptions';
import type { Paginated } from '@/shared/pagination';
import type {
  SubscriptionRequestCreateInput,
  SubscriptionRequestListQuery,
  SubscriptionRequestUpdate,
  SubscriptionRequestsRepository,
} from '@/backend/repositories/subscriptions/subscriptions-repository';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';
import { guardRepositoryMethods, isNotFoundError } from '@/backend/shared/repository-error';

export function createSubscriptionRequestsRepository(
  supabase: SupabaseClient<Database>
): SubscriptionRequestsRepository {
  return guardRepositoryMethods<SubscriptionRequestsRepository>({
    async getById(id: string): Promise<SubscriptionRequest | null> {
      const { data, error } = await supabase
        .from('subscription_requests')
        .select('*')
        .eq('id', id)
        .single();

      // Only PostgREST's no-rows code means absence; anything else is an outage
      // and must reach the controller as a 5xx, not a false 404.
      if (error && !isNotFoundError(error)) throw error;
      if (!data) return null;
      return data as SubscriptionRequest;
    },

    async getByClientId(clientId: string): Promise<SubscriptionRequest | null> {
      const { data, error } = await supabase
        .from('subscription_requests')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;
      return (data as SubscriptionRequest | null) ?? null;
    },

    async list(query: SubscriptionRequestListQuery): Promise<Paginated<SubscriptionRequest>> {
      let request = supabase
        .from('subscription_requests')
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
      const { data, count, error } = await request.range(from, from + query.pageSize - 1);
      if (error) throw error;

      return { data: (data as SubscriptionRequest[]) ?? [], total: count ?? 0 };
    },

    async listByUser(userId: string): Promise<SubscriptionRequest[]> {
      const { data, error } = await supabase
        .from('subscription_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as SubscriptionRequest[]) ?? [];
    },

    async create(input: SubscriptionRequestCreateInput): Promise<SubscriptionRequest> {
      const { data, error } = await supabase
        .from('subscription_requests')
        .insert({
          user_id: input.user_id,
          plan: input.plan,
          full_name: input.full_name,
          phone_whatsapp: input.phone_whatsapp,
          email: input.email,
          note: input.note,
          reference_code: input.reference_code,
          client_id: input.client_id ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return data as SubscriptionRequest;
    },

    async update(id: string, input: SubscriptionRequestUpdate): Promise<SubscriptionRequest> {
      const { data, error } = await supabase
        .from('subscription_requests')
        .update({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as SubscriptionRequest;
    },
  });
}
