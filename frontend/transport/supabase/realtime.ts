import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/frontend/transport/supabase/client';

export interface PostgresChangeHandlers {
  onInsert: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onUpdate: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onDelete: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

export interface PostgresChangesOptions {
  channel: string;
  table: string;
  filter?: string;
  handlers: PostgresChangeHandlers;
}

export function subscribeToPostgresChanges(options: PostgresChangesOptions): () => void {
  // The client arrives asynchronously (a dynamic import), so an unsubscribe can
  // land before there is anything to tear down. The flag is what makes it
  // authoritative either way: the `.then` below must not join a channel nobody
  // will ever remove, which would keep firing the old handlers — for a signed-out
  // identity, at the cost of a Realtime topic per leak.
  let cancelled = false;
  let cleanup: (() => void) | null = null;

  createClient()
    .then((supabase) => {
      if (cancelled) return;

      const channel = supabase
        .channel(options.channel)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: options.table,
            ...(options.filter ? { filter: options.filter } : {}),
          },
          options.handlers.onInsert
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: options.table,
            ...(options.filter ? { filter: options.filter } : {}),
          },
          options.handlers.onUpdate
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: options.table,
            ...(options.filter ? { filter: options.filter } : {}),
          },
          options.handlers.onDelete
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })
    .catch(() => {
      cleanup = () => {};
    });

  return () => {
    if (cancelled) return;
    cancelled = true;
    cleanup?.();
  };
}
