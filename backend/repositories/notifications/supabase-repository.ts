import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/shared/contracts/database.types';
import type { INotificationRepository } from '@/backend/ports/notifications/interfaces';
import type { Notification, NotificationCreateInput } from '@/backend/models/notifications';

export function createSupabaseNotificationRepository(
  supabase: SupabaseClient<Database>
): INotificationRepository {
  return {
    async findByUserId(userId: string, limit = 20, offset = 0) {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return (data ?? []) as unknown as Notification[];
    },

    async findUnreadCount(userId: string) {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      return count ?? 0;
    },

    async create(input: NotificationCreateInput) {
      const { data } = await supabase
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

      return data as unknown as Notification;
    },

    async markAsRead(id: string, userId: string) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
    },

    async markAllAsRead(userId: string) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);
    },

    async delete(id: string, userId: string) {
      await supabase.from('notifications').delete().eq('id', id).eq('user_id', userId);
    },
  };
}
