import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  DevicePushTokenRecord,
  DevicePushTokenRepository,
  DevicePushTokenUpsertInput,
} from '@/backend/repositories/push/device-push-tokens-repository';

type DevicePushTokenRow = Database['public']['Tables']['device_push_tokens']['Row'];

const IN_CHUNK_SIZE = 500;

function toRecord(row: DevicePushTokenRow): DevicePushTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    platform: row.platform,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Supabase-backed native device-token repository, the FCM twin of
 * `createPushSubscriptionsRepository`. Two clients use it:
 * - the admin (service-role) client for registration, dispatch reads and
 *   dead-token pruning: a token is unique per install, so re-registering after
 *   a user switch has to reassign a row RLS would not let the caller touch;
 * - a caller-scoped client for unregistering on sign-out, where "only my own
 *   row" is exactly the right rule.
 */
export function createDevicePushTokensRepository(
  supabase: SupabaseClient<Database>
): DevicePushTokenRepository {
  return {
    async upsert(userId: string, input: DevicePushTokenUpsertInput) {
      const { error } = await supabase.from('device_push_tokens').upsert(
        {
          user_id: userId,
          token: input.token,
          platform: input.platform,
          user_agent: input.userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      );
      if (error) throw error;
    },

    async findByUserId(userId: string) {
      const { data, error } = await supabase
        .from('device_push_tokens')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []).map(toRecord);
    },

    async findForUsers(userIds: string[]) {
      const results: DevicePushTokenRow[] = [];
      for (let i = 0; i < userIds.length; i += IN_CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + IN_CHUNK_SIZE);
        if (chunk.length === 0) continue;
        const { data, error } = await supabase
          .from('device_push_tokens')
          .select('*')
          .in('user_id', chunk);
        if (error) throw error;
        results.push(...(data ?? []));
      }
      return results.map(toRecord);
    },

    async removeByToken(userId: string, token: string) {
      const { error } = await supabase
        .from('device_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token);
      if (error) throw error;
    },

    async removeToken(token: string) {
      const { error } = await supabase.from('device_push_tokens').delete().eq('token', token);
      if (error) throw error;
    },
  };
}
