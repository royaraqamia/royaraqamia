'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { joinChatPresenceReader } from '@/frontend/api/chats';
import {
  CHAT_RECORDING_TIMEOUT_MS,
  CHAT_TYPING_TIMEOUT_MS,
  type ChatConversationSummary,
  type ChatPresenceState,
} from '@/shared/contracts/chat';

/** The states the list is drawing right now, keyed by conversation id. */
export type ChatPresenceMap = Readonly<Record<string, ChatPresenceState>>;

/**
 * The chats list's presence (ADR-0165): one subscription for every row.
 *
 * The member joins their own `presence:` topic once, and each event names the
 * conversation it belongs to — which is the reason the topic is per member
 * rather than per thread. An event is drawn only when its sender is the direct
 * thread's own counterpart, so a peer cannot make another member appear to be
 * writing, and a conversation the list no longer holds is dropped.
 */
export function useChatPresenceList(
  threads: ChatConversationSummary[],
  selfId: string | null
): ChatPresenceMap {
  const [presence, setPresence] = useState<ChatPresenceMap>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /** The counterpart each direct row is allowed to hear from. */
  const peers = useMemo(() => {
    const byConversation = new Map<string, string>();
    for (const thread of threads) {
      if (thread.kind === 'direct' && thread.counterpart) {
        byConversation.set(thread.id, thread.counterpart.id);
      }
    }
    return byConversation;
  }, [threads]);

  // The subscription outlives a row changing; the roster is read through a ref
  // so a refreshed list cannot join a second channel or drop the live one.
  const peersRef = useRef(peers);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    if (!selfId) return;

    const pending = timers.current;
    const forget = (conversationId: string) => {
      const timer = pending.get(conversationId);
      if (timer) clearTimeout(timer);
      pending.delete(conversationId);
      setPresence((current) => {
        if (!(conversationId in current)) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    };

    const reader = joinChatPresenceReader(selfId, (event) => {
      const peer = peersRef.current.get(event.conversationId);
      if (!peer || peer !== event.userId) return;

      const timer = pending.get(event.conversationId);
      if (timer) clearTimeout(timer);

      if (event.state === 'stop') {
        forget(event.conversationId);
        return;
      }

      // A const, because the state is read again inside the timer's closure.
      const state = event.state;
      pending.set(
        event.conversationId,
        setTimeout(
          () => forget(event.conversationId),
          state === 'recording' ? CHAT_RECORDING_TIMEOUT_MS : CHAT_TYPING_TIMEOUT_MS
        )
      );
      setPresence((current) =>
        current[event.conversationId] === state
          ? current
          : { ...current, [event.conversationId]: state }
      );
    });

    return () => {
      reader.leave();
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      setPresence({});
    };
  }, [selfId]);

  // A conversation that left the list has no row to draw, and its timer would
  // only wake up to set state nobody reads.
  useEffect(() => {
    setPresence((current) => {
      const live = new Set(threads.map((thread) => thread.id));
      const next = Object.fromEntries(
        Object.entries(current).filter(([conversationId]) => live.has(conversationId))
      ) as ChatPresenceMap;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [threads]);

  return presence;
}
