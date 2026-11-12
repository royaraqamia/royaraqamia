'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { joinChatPresenceChannel, type ChatPresenceChannel } from '@/frontend/api/chats';
import {
  CHAT_RECORDING_TIMEOUT_MS,
  CHAT_TYPING_TIMEOUT_MS,
  type ChatConversationSummary,
  type ChatPresenceEvent,
  type ChatPresenceState,
} from '@/shared/contracts/chat';

/** The states the list is drawing right now, keyed by conversation id. */
export type ChatPresenceMap = Readonly<Record<string, ChatPresenceState>>;

/**
 * The chats list's presence (ADR-0167): one subscription per row it can hear.
 *
 * Presence lives on the conversation's own topic, so the list joins a channel
 * per direct, active thread and drops the channel with the row. That is the
 * price of the platform's rule — Realtime authorises a join against the `select`
 * policy, so the peer's state cannot be heard on a stream the sender writes into
 * without reading. Each event is drawn only when its sender is the direct
 * thread's own counterpart, so a member cannot make another appear to be
 * writing, and a conversation the list no longer holds is dropped.
 */
export function useChatPresenceList(
  threads: ChatConversationSummary[],
  selfId: string | null
): ChatPresenceMap {
  const [presence, setPresence] = useState<ChatPresenceMap>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const channels = useRef(new Map<string, ChatPresenceChannel>());

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

  // The roster is read through a ref so a refreshed list cannot rejoin a
  // channel it already holds.
  const peersRef = useRef(peers);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const forget = useCallback((conversationId: string) => {
    const timer = timers.current.get(conversationId);
    if (timer) clearTimeout(timer);
    timers.current.delete(conversationId);
    setPresence((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const onEvent = useCallback(
    (event: ChatPresenceEvent) => {
      const peer = peersRef.current.get(event.conversationId);
      if (!peer || peer !== event.userId) return;

      const timer = timers.current.get(event.conversationId);
      if (timer) clearTimeout(timer);

      if (event.state === 'stop') {
        forget(event.conversationId);
        return;
      }

      // A const, because the state is read again inside the timer's closure.
      const state = event.state;
      timers.current.set(
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
    },
    [forget]
  );

  /** The rows whose topic the member may join: a direct, active thread. */
  const live = useMemo(
    () =>
      threads
        .filter(
          (thread) =>
            thread.kind === 'direct' &&
            thread.counterpart !== null &&
            thread.status === 'active' &&
            thread.myStatus === 'active'
        )
        .map((thread) => thread.id),
    [threads]
  );

  // A stable key, because the array itself is new on every list refresh and the
  // effect must not churn a channel that is already joined.
  const liveKey = live.join('|');

  useEffect(() => {
    const joined = channels.current;

    // Signing out closes what the screen holds, rather than leaving a joined
    // topic behind for the next member.
    if (!selfId) {
      for (const [conversationId, channel] of joined) {
        channel.leave();
        forget(conversationId);
      }
      joined.clear();
      return;
    }

    const wanted = new Set(liveKey ? liveKey.split('|') : []);

    for (const [conversationId, channel] of joined) {
      if (wanted.has(conversationId)) continue;
      channel.leave();
      joined.delete(conversationId);
      forget(conversationId);
    }

    for (const conversationId of wanted) {
      if (joined.has(conversationId)) continue;
      joined.set(conversationId, joinChatPresenceChannel(conversationId, selfId, onEvent));
    }
  }, [forget, liveKey, onEvent, selfId]);

  // Leaving the screen closes every channel it opened, whatever the list holds.
  useEffect(() => {
    const joined = channels.current;
    const pending = timers.current;
    return () => {
      for (const channel of joined.values()) channel.leave();
      joined.clear();
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      setPresence({});
    };
  }, []);

  // A conversation that left the list has no row to draw, and its timer would
  // only wake up to set state nobody reads.
  useEffect(() => {
    setPresence((current) => {
      const held = new Set(threads.map((thread) => thread.id));
      const next = Object.fromEntries(
        Object.entries(current).filter(([conversationId]) => held.has(conversationId))
      ) as ChatPresenceMap;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [threads]);

  return presence;
}
