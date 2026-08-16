import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  PushSubscriptionUpsertInput,
} from '@/backend/repositories/push/push-subscriptions-repository';

type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row'];

const IN_CHUNK_SIZE = 500;

function toRecord(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Supabase-backed push subscription repository. The same implementation is
 * created with two different clients:
 * - a caller-scoped client (RLS applies) for subscribe/unsubscribe — defense
 *   in depth so a caller can only ever touch their own rows;
 * - the admin (service-role) client for dispatch reads and dead-endpoint
 *   pruning, which must see every user's subscriptions.
 */
export function createPushSubscriptionsRepository(
  supabase: SupabaseClient<Database>
): PushSubscriptionRepository {
  return {
    async upsert(userId: string, input: PushSubscriptionUpsertInput) {
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          user_agent: input.userAgent,
        },
        { onConflict: 'endpoint' }
      );
      if (error) throw error;
    },

    async findByUserId(userId: string) {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []).map(toRecord);
    },

    async findForUsers(userIds: string[]) {
      const results: PushSubscriptionRow[] = [];
      for (let i = 0; i < userIds.length; i += IN_CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + IN_CHUNK_SIZE);
        if (chunk.length === 0) continue;
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('*')
          .in('user_id', chunk);
        if (error) throw error;
        results.push(...(data ?? []));
      }
      return results.map(toRecord);
    },

    async removeByEndpoint(userId: string, endpoint: string) {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
      if (error) throw error;
    },

    async removeEndpoint(endpoint: string) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) throw error;
    },
  };
}
