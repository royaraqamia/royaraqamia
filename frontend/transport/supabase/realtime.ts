import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/frontend/transport/supabase/client';

export interface PostgresChangeHandlers {
  onInsert: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onUpdate: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onDelete: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

export function subscribeToNotificationChanges(
  userId: string,
  handlers: PostgresChangeHandlers
): () => void {
  const supabase = createClient();

  const channel = supabase
    .channel('notifications_realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      handlers.onInsert
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      handlers.onUpdate
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      handlers.onDelete
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
