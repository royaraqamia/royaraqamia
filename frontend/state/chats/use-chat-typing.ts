'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { joinChatTyping, type ChatTypingChannel } from '@/frontend/api/chats';
import { CHAT_TYPING_THROTTLE_MS, CHAT_TYPING_TIMEOUT_MS } from '@/shared/contracts/chat';

export interface ChatTypingState {
  /** The members writing right now, as user ids, in the order they started. */
  typers: string[];
  /** A keystroke: broadcasts at once, then at most once per window. */
  noteTyping: () => void;
  /** The draft was sent or emptied, so the peer's indicator goes now. */
  stopTyping: () => void;
}

/**
 * Who is writing in one open thread (#816).
 *
 * Nothing here is stored: the composer broadcasts on a private per-conversation
 * topic and the reader forgets each writer five seconds after their last event,
 * so a closed tab or a dropped "stop" cannot leave an indicator pinned on
 * screen. The indicator is the only thing this hook owns — no table, no cache
 * entry, and no message payload crosses the channel.
 */
export function useChatTyping(conversationId: string, selfId: string | null): ChatTypingState {
  const [typers, setTypers] = useState<string[]>([]);
  const channelRef = useRef<ChatTypingChannel | null>(null);
  const lastSentRef = useRef(0);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!selfId) return;

    const timers = timersRef.current;
    const forget = (userId: string) => {
      const pending = timers.get(userId);
      if (pending) clearTimeout(pending);
      timers.delete(userId);
      setTypers((current) =>
        current.includes(userId) ? current.filter((id) => id !== userId) : current
      );
    };

    const channel = joinChatTyping(conversationId, selfId, {
      onTyping: (userId) => {
        const pending = timers.get(userId);
        if (pending) clearTimeout(pending);
        timers.set(
          userId,
          setTimeout(() => forget(userId), CHAT_TYPING_TIMEOUT_MS)
        );
        setTypers((current) => (current.includes(userId) ? current : [...current, userId]));
      },
      onStop: forget,
    });

    channelRef.current = channel;
    lastSentRef.current = 0;

    return () => {
      channel.leave();
      channelRef.current = null;
      for (const pending of timers.values()) clearTimeout(pending);
      timers.clear();
      // A thread that closes (or a member who leaves) has nobody writing in it.
      setTypers([]);
    };
  }, [conversationId, selfId]);

  const noteTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < CHAT_TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    channelRef.current?.typing();
  }, []);

  const stopTyping = useCallback(() => {
    lastSentRef.current = 0;
    channelRef.current?.stop();
  }, []);

  return { typers, noteTyping, stopTyping };
}
