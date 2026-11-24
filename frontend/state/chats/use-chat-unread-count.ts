'use client';

import { useCallback, useEffect, useState } from 'react';

import { getChatUnreadCount } from '@/frontend/api/chats';
import { subscribeToPostgresChanges } from '@/frontend/transport/supabase/realtime';

/**
 * The Chats tab badge: one aggregate read, independent of the list (#1803).
 *
 * The bell's destination used to open the whole conversation list just to sum
 * its rows. This hook reads the sum on its own, and refreshes it only when a
 * message or the member's own roster row actually changes — never on a timer.
 * A failed read keeps the last number rather than claiming zero unread.
 */
export function useChatUnreadCount(enabled: boolean, userId: string | null): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      setCount(await getChatUnreadCount());
    } catch {
      // The last answer stays: a network blip is not "nothing is unread".
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !userId) {
      setCount(0);
      return;
    }
    void refresh();

    const onChange = () => void refresh();
    const stopMessages = subscribeToPostgresChanges({
      channel: `chat-unread:${userId}`,
      table: 'chat_messages',
      handlers: { onInsert: onChange, onUpdate: onChange, onDelete: onChange },
    });
    const stopRoster = subscribeToPostgresChanges({
      channel: `chat-unread-roster:${userId}`,
      table: 'chat_participants',
      filter: `user_id=eq.${userId}`,
      handlers: { onInsert: onChange, onUpdate: onChange, onDelete: onChange },
    });

    return () => {
      stopMessages();
      stopRoster();
    };
  }, [enabled, userId, refresh]);

  return count;
}
