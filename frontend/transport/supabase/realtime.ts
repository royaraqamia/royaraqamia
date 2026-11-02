import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
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

/**
 * Broadcast is for facts that are worth nothing a minute later — a member is
 * typing, and then they are not. Nothing about it reaches Postgres: the channel
 * carries no history, no row and nothing the offline cache ever sees.
 *
 * The channel is always **private**: Realtime authorises a private topic with
 * the policies on `realtime.messages`, so a channel named with a conversation id
 * is a boundary rather than a guessable name. The composer's membership is the
 * policy's predicate (ADR-0113), and the reader's identity comes from the socket's
 * own JWT, which the Supabase client keeps in step (`setAuth` on every token
 * change).
 *
 * `send` before the channel has joined is not a dropped keystroke: the payload
 * waits for `SUBSCRIBED` and is flushed then. That is what makes the first
 * keystroke of a freshly opened thread reach the peer.
 */
export interface BroadcastHandlers {
  [event: string]: (payload: Record<string, unknown>) => void;
}

export interface BroadcastOptions {
  /** Realtime topic, e.g. `chat:<conversation id>`. */
  topic: string;
  handlers: BroadcastHandlers;
}

export interface BroadcastChannelHandle {
  send: (event: string, payload?: Record<string, unknown>) => void;
  leave: () => void;
}

export function joinBroadcastChannel(options: BroadcastOptions): BroadcastChannelHandle {
  // The client arrives asynchronously, and so does the join. A send that lands
  // in between waits in `queued`, capped so a channel that never joins cannot
  // grow without a bound.
  let cancelled = false;
  let channel: RealtimeChannel | null = null;
  let socket: { removeChannel: (channel: RealtimeChannel) => unknown } | null = null;
  let joined = false;
  const queued: Array<{ event: string; payload: Record<string, unknown> }> = [];

  const send = (event: string, payload: Record<string, unknown> = {}) => {
    if (cancelled) return;
    if (!channel || !joined) {
      if (queued.length < 8) queued.push({ event, payload });
      return;
    }
    void channel.send({ type: 'broadcast', event, payload });
  };

  createClient()
    .then((supabase) => {
      if (cancelled) return;

      let bound = supabase.channel(options.topic, { config: { private: true } });
      for (const [event, handler] of Object.entries(options.handlers)) {
        bound = bound.on('broadcast', { event }, (message) => {
          handler((message.payload ?? {}) as Record<string, unknown>);
        });
      }

      socket = supabase;
      channel = bound.subscribe((status) => {
        joined = status === 'SUBSCRIBED';
        if (joined) for (const message of queued.splice(0)) send(message.event, message.payload);
      });
    })
    .catch(() => {
      channel = null;
    });

  return {
    send,
    leave: () => {
      if (cancelled) return;
      cancelled = true;
      if (channel) void socket?.removeChannel(channel);
      channel = null;
    },
  };
}
