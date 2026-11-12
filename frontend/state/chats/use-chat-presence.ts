'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acquireChatPresence,
  type ChatPresenceHandle,
} from '@/frontend/state/chats/presence-channels';
import {
  CHAT_RECORDING_HEARTBEAT_MS,
  CHAT_RECORDING_TIMEOUT_MS,
  CHAT_TYPING_THROTTLE_MS,
  CHAT_TYPING_TIMEOUT_MS,
  type ChatPresenceState,
} from '@/shared/contracts/chat';

export interface ChatPresenceHook {
  /** What the peer is doing right now, or `null` when they are idle. */
  peer: ChatPresenceState | null;
  /** A keystroke: broadcasts at once, then at most once per window. */
  noteTyping: () => void;
  /** The recorder opened or closed; a recording outranks typing while it runs. */
  noteRecording: (recording: boolean) => void;
  /** The draft was sent or emptied, so the peer's indicator goes now. */
  stopTyping: () => void;
}

/**
 * Who is writing, and who is recording, in one open thread (ADR-0167).
 *
 * One subscription per conversation, carrying both halves: the member hears the
 * peer on `presence:<conversation id>` and says what they are doing through the
 * same join, because Realtime authorises a channel join against the `select`
 * policy and a write-only channel is not a shape it admits.
 *
 * The channel belongs to the conversation rather than to this screen (ADR-0171),
 * so opening a thread from the list reclaims the join the list already paid for
 * instead of paying a second one on the first keystroke (#1332).
 *
 * Nothing is stored: the reader forgets each state on its window (five seconds
 * for typing, six for a recording, whose heartbeats are four apart), so a
 * closed tab or a dropped stop cannot pin an indicator on screen. A recording
 * outranks typing because a member holding the microphone is not writing.
 */
export function useChatPresence(conversationId: string, selfId: string | null): ChatPresenceHook {
  const [peer, setPeer] = useState<ChatPresenceState | null>(null);
  const handleRef = useRef<ChatPresenceHandle | null>(null);
  const lastSentRef = useRef(0);
  const recordingRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiry = useCallback(() => {
    if (expiryRef.current !== null) {
      clearTimeout(expiryRef.current);
      expiryRef.current = null;
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // The conversation's own stream. The route joins it as soon as the member is
  // known and releases it if the read says they cannot write here (ADR-0167,
  // amended by ADR-0171), so the first keystroke never queues behind the join.
  useEffect(() => {
    if (!selfId) return;

    lastSentRef.current = 0;
    recordingRef.current = false;

    const handle = acquireChatPresence(conversationId, selfId, (event) => {
      clearExpiry();
      if (event.state === 'stop') {
        setPeer(null);
        return;
      }

      setPeer(event.state);
      expiryRef.current = setTimeout(
        () => {
          expiryRef.current = null;
          setPeer(null);
        },
        event.state === 'recording' ? CHAT_RECORDING_TIMEOUT_MS : CHAT_TYPING_TIMEOUT_MS
      );
    });
    handleRef.current = handle;

    return () => {
      handle.release();
      handleRef.current = null;
      recordingRef.current = false;
      clearExpiry();
      stopHeartbeat();
      setPeer(null);
    };
  }, [clearExpiry, conversationId, selfId, stopHeartbeat]);

  const noteTyping = useCallback(() => {
    if (recordingRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < CHAT_TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    handleRef.current?.announce('typing');
  }, []);

  const stopTyping = useCallback(() => {
    // A recording's own stop is what ends it; a sent draft is not a reason to
    // cut the recording announcement short.
    if (recordingRef.current) return;
    lastSentRef.current = 0;
    handleRef.current?.stop();
  }, []);

  const noteRecording = useCallback(
    (recording: boolean) => {
      recordingRef.current = recording;

      if (!recording) {
        stopHeartbeat();
        lastSentRef.current = 0;
        handleRef.current?.stop();
        return;
      }

      lastSentRef.current = Date.now();
      handleRef.current?.announce('recording');
      if (heartbeatRef.current === null) {
        heartbeatRef.current = setInterval(() => {
          handleRef.current?.announce('recording');
        }, CHAT_RECORDING_HEARTBEAT_MS);
      }
    },
    [stopHeartbeat]
  );

  return { peer, noteTyping, noteRecording, stopTyping };
}
