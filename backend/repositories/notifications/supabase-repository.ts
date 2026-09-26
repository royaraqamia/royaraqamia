import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/backend/models/database.types';
import type {
  NotificationRepository,
  NotificationBroadcastInput,
} from '@/backend/repositories/notifications/notifications-repository';
import type { Notification, NotificationCreateInput } from '@/shared/contracts/notifications';
import { repositoryFailure } from '@/backend/shared/repository-error';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as Notification['type'],
    title: row.title,
    body: row.body,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    is_read: row.is_read,
    created_at: row.created_at,
    read_at: row.read_at,
  };
}

export function createSupabaseNotificationRepository(
  supabase: SupabaseClient<Database>
): NotificationRepository {
  return {
    async findByUserId(userId: string, limit = 20, offset = 0) {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw repositoryFailure('notifications.findByUserId', error);

      return (data ?? []).map(toNotification);
    },

    async findUnreadCount(userId: string) {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw repositoryFailure('notifications.findUnreadCount', error);

      return count ?? 0;
    },

    async create(input: NotificationCreateInput) {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_id: input.user_id,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          metadata: (input.metadata ?? {}) as Json,
        })
        .select()
        .single();

      if (error) throw repositoryFailure('notifications.create', error);

      return data ? toNotification(data) : null;
    },

    async broadcast(input: NotificationBroadcastInput, userIds: string[]) {
      if (userIds.length === 0) return 0;
      const rows = userIds.map((userId) => ({
        user_id: userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        metadata: (input.metadata ?? {}) as Json,
        is_read: false,
      }));

      const { data, error } = await supabase.from('notifications').insert(rows).select('id');

      if (error) throw repositoryFailure('notifications.broadcast', error);

      return data?.length ?? 0;
    },

    async markAsRead(id: string, userId: string) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw repositoryFailure('notifications.markAsRead', error);
    },

    async markAllAsRead(userId: string) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw repositoryFailure('notifications.markAllAsRead', error);
    },

    async delete(id: string, userId: string) {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw repositoryFailure('notifications.delete', error);
    },
  };
}
