'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { acquireChatPresence } from '@/frontend/state/chats/presence-channels';
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
 * Presence lives on the conversation's own topic, so the list wants a channel
 * per direct, active thread. The channel itself belongs to the conversation
 * rather than to this screen (ADR-0171), so a row it stops drawing releases its
 * claim and the thread the member opens next reclaims the same join. That is
 * the price of the platform's rule — Realtime authorises a join against the
 * `select` policy, so the peer's state cannot be heard on a stream the sender
 * writes into without reading. Each event is drawn only when its sender is the
 * direct thread's own counterpart, so a member cannot make another appear to be
 * writing, and a conversation the list no longer holds is dropped.
 */
export function useChatPresenceList(
  threads: ChatConversationSummary[],
  selfId: string | null
): ChatPresenceMap {
  const [presence, setPresence] = useState<ChatPresenceMap>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const releases = useRef(new Map<string, () => void>());

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
    const claimed = releases.current;

    // Signing out closes what the screen holds, rather than leaving a joined
    // topic behind for the next member.
    if (!selfId) {
      for (const [conversationId, release] of claimed) {
        release();
        forget(conversationId);
      }
      claimed.clear();
      return;
    }

    const wanted = new Set(liveKey ? liveKey.split('|') : []);

    for (const [conversationId, release] of claimed) {
      if (wanted.has(conversationId)) continue;
      release();
      claimed.delete(conversationId);
      forget(conversationId);
    }

    for (const conversationId of wanted) {
      if (claimed.has(conversationId)) continue;
      claimed.set(conversationId, acquireChatPresence(conversationId, selfId, onEvent).release);
    }
  }, [forget, liveKey, onEvent, selfId]);

  // Leaving the screen releases every claim it made, whatever the list holds.
  // The topic itself waits out the grace window, because the thread this screen
  // opens is the next holder (ADR-0171).
  useEffect(() => {
    const claimed = releases.current;
    const pending = timers.current;
    return () => {
      for (const release of claimed.values()) release();
      claimed.clear();
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
